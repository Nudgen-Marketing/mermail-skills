#!/usr/bin/env node
// Countersig: prove a payout wallet before an agent pays it.
// Zero dependencies. Node.js 22+. Reads Solana or Base JSON-RPC; writes only when `sign` or `anchor` is called.
// Chains: devnet | testnet | mainnet-beta (Solana memo program) and base-sepolia | base (EVM: 0-value self-send, memo as calldata).
//
//   node countersig.mjs challenge --claimed <addr> --channel <email> --counterparty <name> [--prior <addr>] [--cluster devnet]
//   node countersig.mjs verify    --claimed <addr> --nonce <nonce> --issued-at <iso> --expires-at <iso> [--prior <addr>] [--known a,b] [--cluster devnet]
//                                 [--control-tx <hash>] [--rotation-tx <hash>]   (Base only: EVM RPC cannot list txs by address)
//   node countersig.mjs receipt   --verdict-file <verify.json> --challenge-file <challenge.json>
//   node countersig.mjs gate      --verdict-file <verify.json> --amount-usd <n> [--payment-cluster <c>] [--destination <addr>] [--history-file <json>]
//   node countersig.mjs receipt-check --text-file <receipt.txt> --origin draft|sent|inbound [--anchor-wallet <addr>]
//   node countersig.mjs anchor    --receipt-file <receipt.json> --keypair <path> [--cluster devnet]
//   node countersig.mjs sign      --keypair <path> --memo <text> [--cluster devnet]      (payee side, for testing)
//   node countersig.mjs keygen    --out <path> [--cluster base-sepolia]                   (throwaway test key)
//
// Output is always one JSON object on stdout.
// Exit codes: 0 verified or command succeeded, 2 pending / not proven, 3 hard stop, 1 usage or network error.

import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, sign as edSign } from "node:crypto";
import { realpathSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { EVM_CHAINS, evmExplorer, findEvmProof, isEvmAddress, isEvmChain, loadEvmKey, newEvmKey, sendEvmMemo } from "./evm.mjs";

export const VERSION = "v1";
export const MEMO_PROGRAM = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
export const RPC = {
  devnet: "https://api.devnet.solana.com",
  testnet: "https://api.testnet.solana.com",
  "mainnet-beta": "https://api.mainnet-beta.solana.com",
};
const CLOCK_SKEW_S = 300;
const FIRST_CONTACT_COOL_OFF_H = 24;
const DEFAULT_SIGNER_BASE = "https://countersig.vercel.app";

// ---------- base58 ----------
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export function b58encode(bytes) {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) + BigInt(b);
  let out = "";
  while (n > 0n) {
    out = B58[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = "1" + out;
  }
  return out;
}
export function b58decode(text) {
  let n = 0n;
  for (const ch of text) {
    const i = B58.indexOf(ch);
    if (i < 0) throw new Error(`invalid base58 character "${ch}"`);
    n = n * 58n + BigInt(i);
  }
  const bytes = [];
  while (n > 0n) {
    bytes.unshift(Number(n & 0xffn));
    n >>= 8n;
  }
  for (const ch of text) {
    if (ch !== "1") break;
    bytes.unshift(0);
  }
  return Uint8Array.from(bytes);
}
export function isSolanaAddress(text) {
  if (typeof text !== "string" || text.length < 32 || text.length > 44) return false;
  try {
    return b58decode(text).length === 32;
  } catch {
    return false;
  }
}

// ---------- nonce + memo formats ----------
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export function newNonce() {
  const bytes = randomBytes(10);
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += CROCKFORD[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return out; // 16 chars, 80 bits
}
export const controlMemo = (nonce) => `countersig:${VERSION}:${nonce}`;
export const rotateMemo = (nonce, claimed) => `countersig:${VERSION}:${nonce}:rotate:${claimed}`;
export const receiptMemo = (sha256) => `countersig:${VERSION}:receipt:${sha256}`;

// ---------- lookalike ----------
export function lookalikes(claimed, known) {
  const norm = (a) => (isEvmAddress(a) ? a.slice(2).toLowerCase() : a);
  const c = norm(claimed);
  return known.filter((k) => k && norm(k) !== c && norm(k).slice(0, 4) === c.slice(0, 4) && norm(k).slice(-4) === c.slice(-4));
}
export const chainLabel = (cluster) => (isEvmChain(cluster) ? (cluster === "base" ? "Base" : "Base Sepolia") : `Solana ${cluster}`);
const validAddress = (cluster, a) => (isEvmChain(cluster) ? isEvmAddress(a) : isSolanaAddress(a));
const sameAddress = (a, b) => (isEvmAddress(a) && isEvmAddress(b) ? a.toLowerCase() === b.toLowerCase() : a === b);

// ---------- RPC ----------
async function rpc(url, method, params) {
  let lastError;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      if (response.status === 429 || response.status >= 500) throw new Error(`RPC HTTP ${response.status}`);
      const json = await response.json();
      if (json.error) throw Object.assign(new Error(json.error.message), { rpcError: json.error });
      return json.result;
    } catch (error) {
      lastError = error;
      if (error.rpcError) throw error;
      await sleep(600 * (attempt + 1));
    }
  }
  throw lastError;
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function memoTextsFromTransaction(tx) {
  const texts = [];
  const all = [
    ...(tx.transaction.message.instructions ?? []),
    ...(tx.meta?.innerInstructions ?? []).flatMap((inner) => inner.instructions),
  ];
  for (const ix of all) {
    if (ix.programId === MEMO_PROGRAM && typeof ix.parsed === "string") texts.push(ix.parsed);
  }
  return texts;
}

// Find a successful transaction, signed by `address`, inside the time window, whose memo equals `expected`.
// Anyone can reference a wallet in their own transactions, so an attacker can flood it to push a real proof
// (or a conflicting endorsement) off the first page. Page back until the window start; if the page budget
// runs out first, report scanComplete: false so verify fails closed.
export async function findMemoProof({ rpcUrl, address, expected, notBefore, notAfter, scanLimit = 1000, maxPages = 10 }) {
  const signatures = [];
  let before;
  let scanComplete = false;
  for (let page = 0; page < maxPages; page += 1) {
    const batch = await rpc(rpcUrl, "getSignaturesForAddress", [address, { limit: scanLimit, commitment: "confirmed", ...(before ? { before } : {}) }]);
    signatures.push(...batch);
    const oldest = batch.at(-1);
    if (batch.length < scanLimit || (oldest?.blockTime != null && oldest.blockTime < notBefore - CLOCK_SKEW_S)) {
      scanComplete = true;
      break;
    }
    before = oldest.signature;
  }
  const nearMisses = [];
  let match = null;
  // Scan the whole bounded window instead of stopping at the first match, so conflicting memos are seen too.
  for (const entry of signatures) {
    if (entry.blockTime == null) continue;
    if (entry.blockTime < notBefore - CLOCK_SKEW_S || entry.blockTime > notAfter) continue;
    if (!entry.memo || !entry.memo.includes(expected.split(":").slice(0, 3).join(":"))) continue;
    const tx = await rpc(rpcUrl, "getTransaction", [
      entry.signature,
      { encoding: "jsonParsed", maxSupportedTransactionVersion: 0, commitment: "confirmed" },
    ]);
    if (!tx) continue;
    const signer = tx.transaction.message.accountKeys.some((key) => key.pubkey === address && key.signer);
    const memos = memoTextsFromTransaction(tx);
    const exact = memos.includes(expected);
    const evidence = {
      signature: entry.signature,
      slot: tx.slot,
      blockTime: tx.blockTime,
      blockTimeIso: new Date(tx.blockTime * 1000).toISOString(),
      memo: memos.find((m) => m.startsWith(expected.split(":").slice(0, 3).join(":"))) ?? memos[0] ?? null,
      signedByAddress: signer,
      succeeded: tx.meta?.err == null,
    };
    if (exact && signer && evidence.succeeded && !match) match = evidence;
    else nearMisses.push(evidence);
  }
  return { found: Boolean(match), evidence: match, nearMisses, scanned: signatures.length, scanComplete };
}

export const explorer = (signature, cluster) =>
  isEvmChain(cluster) ? evmExplorer(signature, cluster) : `https://explorer.solana.com/tx/${signature}${cluster === "mainnet-beta" ? "" : `?cluster=${cluster}`}`;

// ---------- verdict ----------
export async function verify(input) {
  const cluster = input.cluster ?? "devnet";
  const rpcUrl = input.rpc ?? RPC[cluster] ?? EVM_CHAINS[cluster]?.rpc;
  const evm = isEvmChain(cluster);
  const claimed = input.claimed?.trim();
  const prior = input.prior?.trim() || null;
  const known = [...new Set([...(input.known ?? []), ...(prior ? [prior] : [])])];
  const now = Math.floor((input.now ?? Date.now()) / 1000);
  const issuedAt = Math.floor(Date.parse(input.issuedAt) / 1000);
  const expiresAt = Math.floor(Date.parse(input.expiresAt) / 1000);
  const base = {
    type: "countersig.verdict",
    version: VERSION,
    cluster,
    claimed,
    prior,
    nonce: input.nonce,
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt,
    checkedAt: new Date(now * 1000).toISOString(),
  };
  const done = (verdict, extra = {}) => ({ ...base, verdict, payable: verdict === "VERIFIED_CONTINUITY", ...extra });

  if (!rpcUrl) return done("INVALID_INPUT", { reason: `unknown cluster ${cluster}` });
  const kind = evm ? "0x-prefixed 20-byte EVM address" : "32-byte base58 Solana public key";
  if (!validAddress(cluster, claimed)) return done("INVALID_ADDRESS", { reason: `claimed address is not a ${kind}` });
  if (prior && !validAddress(cluster, prior)) return done("INVALID_ADDRESS", { reason: `prior address is not a ${kind}` });
  if (!/^[0-9A-Z]{16}$/.test(input.nonce ?? "")) return done("INVALID_INPUT", { reason: "nonce must be the 16-character challenge nonce" });
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || expiresAt <= issuedAt) {
    return done("INVALID_INPUT", { reason: "issued-at and expires-at must be ISO timestamps with expires-at after issued-at" });
  }
  if (prior && sameAddress(prior, claimed)) return done("UNCHANGED", { reason: "claimed address equals the prior verified wallet; no rotation to prove" });

  const collisions = lookalikes(claimed, known);
  if (collisions.length) {
    return done("LOOKALIKE", {
      reason: "claimed address shares first and last four characters with a different known wallet (address-poisoning pattern)",
      collisions,
    });
  }

  const windowEnd = Math.min(now, expiresAt);
  const find = (address, expected, txHash) =>
    evm
      ? findEvmProof({ cluster, rpcUrl, address, expected, txHash, notBefore: issuedAt, notAfter: windowEnd, clockSkew: CLOCK_SKEW_S })
      : findMemoProof({ rpcUrl, address, expected, notBefore: issuedAt, notAfter: windowEnd });
  const control = await find(claimed, controlMemo(input.nonce), input.controlTx);
  let rotation = null;
  if (prior) {
    rotation = await find(prior, rotateMemo(input.nonce, claimed), input.rotationTx);
    // Any conflicting endorsement for this nonce blocks payment, even if the expected one also exists.
    const wrongTarget = rotation.nearMisses.find(
      (miss) =>
        miss.signedByAddress &&
        miss.succeeded &&
        miss.memo?.startsWith(`countersig:${VERSION}:${input.nonce}:rotate:`) &&
        !sameAddress(miss.memo.split(":rotate:")[1] ?? "", claimed),
    );
    if (wrongTarget) {
      return done("MISMATCH", {
        reason: "the prior wallet endorsed a different address for this nonce",
        evidence: { rotation: withLink(wrongTarget, cluster) },
      });
    }
  }
  const evidence = {
    control: control.found ? withLink(control.evidence, cluster) : null,
    rotation: rotation?.found ? withLink(rotation.evidence, cluster) : null,
  };
  const trustLadder = { L1_control: control.found, L2_channel: "attested by the agent: nonce sent only to the pre-existing authenticated address", L3_continuity: prior ? Boolean(rotation?.found) : "not applicable (first contact)" };

  if (prior && rotation.scanComplete === false) {
    // A conflicting endorsement could sit beyond the pages we read; never call that verified.
    return done("PENDING", { evidence, trustLadder, missing: ["complete history of the prior wallet"], reason: "the prior wallet has more transactions in the window than the scan budget; possible flooding, retry with a dedicated RPC" });
  }
  if (control.found && prior && rotation.found) return done("VERIFIED_CONTINUITY", { evidence, trustLadder });
  if (control.found && !prior) {
    const coolOffUntil = new Date((control.evidence.blockTime + FIRST_CONTACT_COOL_OFF_H * 3600) * 1000).toISOString();
    return done("VERIFIED_CHANNEL", {
      evidence,
      trustLadder,
      coolOffUntil,
      payableAfterCoolOff: true,
      reason: `first contact: control proven, no prior wallet to countersign; hold payment until ${coolOffUntil}; gate returns HOLD before then`,
    });
  }
  if (now > expiresAt) return done("EXPIRED", { evidence, trustLadder, reason: "challenge window closed before every required proof landed" });
  const hashNote = evm ? " (reply with its transaction hash)" : "";
  const missing = [!control.found && `control memo from the claimed wallet${hashNote}`, prior && !rotation.found && `rotation memo from the prior wallet${hashNote}`].filter(Boolean);
  return done("PENDING", { evidence, trustLadder, missing, reason: `waiting for: ${missing.join(" and ")}` });
}
const withLink = (evidence, cluster) => ({ ...evidence, explorer: explorer(evidence.signature, cluster) });

// ---------- challenge ----------
export function challenge({ claimed, channel, counterparty, prior, cluster = "devnet", ttlHours = 72, signerBase = DEFAULT_SIGNER_BASE, now = Date.now() }) {
  if (!RPC[cluster] && !isEvmChain(cluster)) throw new Error(`unknown cluster ${cluster}`);
  const evm = isEvmChain(cluster);
  if (!validAddress(cluster, claimed)) throw new Error(`claimed address is not a valid ${evm ? "EVM" : "Solana"} address`);
  if (prior && !validAddress(cluster, prior)) throw new Error(`prior address is not a valid ${evm ? "EVM" : "Solana"} address`);
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(channel ?? "")) throw new Error("channel must be one plain email address");
  const nonce = newNonce();
  const issuedAt = new Date(now).toISOString();
  const expiresAt = new Date(now + ttlHours * 3600 * 1000).toISOString();
  const memoControl = controlMemo(nonce);
  const memoRotate = prior ? rotateMemo(nonce, claimed) : null;
  const params = new URLSearchParams({ n: nonce, a: claimed, c: cluster, i: String(Math.floor(now / 1000)), e: String(Math.floor(Date.parse(expiresAt) / 1000)) });
  if (prior) params.set("p", prior);
  const signUrl = `${signerBase}/sign?${params}`;
  const short = (a) => `${a.slice(0, 4)}...${a.slice(-4)}`;
  const who = counterparty || channel;
  const subject = `Confirm your payout wallet ${short(claimed)} (code ${nonce.slice(0, 4)}-${nonce.slice(4, 8)})`;
  const how = evm ? "send a 0 ETH transaction to itself whose data field is this exact text" : "send a transaction with this exact memo";
  const hex = (m) => `0x${Buffer.from(m, "utf8").toString("hex")}`;
  const steps = [
    `1. From the wallet ${claimed}, ${how}:`,
    `   ${memoControl}`,
    ...(evm ? [`   (hex data: ${hex(memoControl)})`] : []),
    ...(prior
      ? [
          `2. From the wallet we paid before, ${prior}, ${how}:`,
          `   ${memoRotate}`,
          ...(evm ? [`   (hex data: ${hex(memoRotate)})`] : []),
        ]
      : []),
  ];
  const text = [
    `Hi ${who},`,
    "",
    `We received a request to send future payments to ${claimed} on ${chainLabel(cluster)}.`,
    "Before we change anything, we need the wallet itself to confirm it. No funds move, and you only pay the network fee.",
    "",
    ...steps,
    "",
    evm ? "Then reply to this email with the transaction hash (or hashes). Only the hash, never a key." : `Easiest route: open ${signUrl} and approve in Phantom, Solflare or Backpack.`,
    `This code expires at ${expiresAt}. If you did not ask for a change, do not sign anything and reply to let us know.`,
    "",
    "We will never ask you for a seed phrase, private key or a test payment.",
  ].join("\n");
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.55;color:#111">
<p>Hi ${esc(who)},</p>
<p>We received a request to send future payments to <code>${esc(claimed)}</code> on ${esc(chainLabel(cluster))}. Before we change anything, the wallet itself needs to confirm it. No funds move; you only pay the network fee.</p>
<ol><li>From <code>${esc(claimed)}</code>, ${how}: <code>${esc(memoControl)}</code></li>${
    prior ? `<li>From the wallet we paid before, <code>${esc(prior)}</code>, ${how}: <code>${esc(memoRotate)}</code></li>` : ""
  }</ol>
${evm ? "<p>Then reply with the transaction hash (or hashes). Only the hash, never a key.</p>" : `<p><a href="${esc(signUrl)}">Open the Countersig signer</a> to do this in Phantom, Solflare or Backpack.</p>`}
<p>The code expires at ${esc(expiresAt)}. If you did not request a change, do not sign and reply to tell us.</p>
<p style="color:#555">We will never ask for a seed phrase, private key or a test payment.</p></div>`;
  return {
    type: "countersig.challenge",
    version: VERSION,
    nonce,
    cluster,
    claimed,
    prior: prior || null,
    channel,
    counterparty: counterparty || null,
    issuedAt,
    expiresAt,
    memoControl,
    memoRotate,
    signUrl: evm ? null : signUrl,
    email: { to: channel, subject, text, html },
  };
}

// ---------- receipt ----------
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().filter((k) => value[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
export function receipt(verdict, challengeRecord) {
  if (verdict.nonce !== challengeRecord.nonce || verdict.claimed !== challengeRecord.claimed) {
    throw new Error("verdict and challenge describe different requests");
  }
  const body = {
    type: "countersig.receipt",
    version: VERSION,
    verdict: verdict.verdict,
    payable: verdict.payable,
    coolOffUntil: verdict.coolOffUntil ?? null,
    counterparty: challengeRecord.counterparty,
    channel: challengeRecord.channel,
    cluster: verdict.cluster,
    claimed: verdict.claimed,
    prior: verdict.prior,
    nonce: verdict.nonce,
    issuedAt: challengeRecord.issuedAt,
    expiresAt: challengeRecord.expiresAt,
    checkedAt: verdict.checkedAt,
    evidence: verdict.evidence ?? null,
  };
  const sha256 = createHash("sha256").update(canonical(body)).digest("hex");
  const lines = [
    `Countersig receipt ${sha256.slice(0, 12)}`,
    `Verdict: ${body.verdict}${body.payable ? " (payable)" : ""}`,
    `Counterparty: ${body.counterparty ?? "-"} via ${body.channel}`,
    `Wallet: ${body.claimed} (${body.cluster})`,
    `Prior wallet: ${body.prior ?? "none, first contact"}`,
    body.evidence?.control ? `Control proof: ${body.evidence.control.explorer}` : "Control proof: missing",
    body.evidence?.rotation ? `Rotation proof: ${body.evidence.rotation.explorer}` : `Rotation proof: ${body.prior ? "missing" : "not required"}`,
    body.coolOffUntil ? `Cool-off until: ${body.coolOffUntil}` : null,
    `Checked: ${body.checkedAt}`,
    `sha256: ${sha256}`,
    `Receipt data: ${Buffer.from(canonical(body)).toString("base64url")}`,
  ].filter(Boolean);
  return { receipt: body, sha256, subject: `[Countersig] ${body.verdict} ${body.counterparty ?? body.channel} ${body.claimed.slice(0, 4)}...${body.claimed.slice(-4)}`, text: lines.join("\n") };
}

// ---------- receipt check ----------
// A subject line is not a receipt. Anyone can email "[Countersig] VERIFIED_CONTINUITY Acme <their wallet>",
// and if that wallet became the "prior wallet" the attacker could countersign their own rotation.
// Trust levels:
//   anchored               sha256 recomputes and our own anchor wallet signed countersig:v1:receipt:<sha256>
//   self_written_unanchored sha256 recomputes and the message is our own draft or sent mail; the user must confirm the wallet
//   untrusted              anything else, including every inbound message
export async function checkReceipt({ text, origin, anchorWallet, anchorCluster = "devnet", rpcUrl, now = Date.now() }) {
  const reasons = [];
  const out = (level, extra = {}) => ({ type: "countersig.receipt-check", version: VERSION, level, usableAsPriorWallet: level === "anchored" ? true : level === "self_written_unanchored" ? "only after the user confirms it" : false, reasons, ...extra });
  const data = /^Receipt data: ([A-Za-z0-9_-]+)$/m.exec(text ?? "")?.[1];
  const claimedSha = /^sha256: ([0-9a-f]{64})$/m.exec(text ?? "")?.[1];
  if (!data || !claimedSha) return (reasons.push("no receipt data or sha256 line"), out("untrusted"));
  let body;
  try {
    body = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
  } catch {
    return (reasons.push("receipt data is not valid JSON"), out("untrusted"));
  }
  const sha256 = createHash("sha256").update(canonical(body)).digest("hex");
  if (sha256 !== claimedSha) return (reasons.push("sha256 does not match the receipt data"), out("untrusted"));
  if (body.type !== "countersig.receipt" || !String(body.verdict).startsWith("VERIFIED")) {
    return (reasons.push(`receipt verdict ${body.verdict} cannot establish a prior wallet`), out("untrusted", { sha256 }));
  }
  const facts = { sha256, wallet: body.claimed, cluster: body.cluster, counterparty: body.counterparty, verdict: body.verdict, checkedAt: body.checkedAt };

  if (anchorWallet) {
    const checkedS = Math.floor(Date.parse(body.checkedAt) / 1000);
    const nowS = Math.floor(now / 1000);
    const proof = isEvmChain(anchorCluster)
      ? { found: false }
      : await findMemoProof({ rpcUrl: rpcUrl ?? RPC[anchorCluster], address: anchorWallet, expected: receiptMemo(sha256), notBefore: checkedS, notAfter: nowS });
    if (proof.found) {
      reasons.push(`anchor memo signed by ${anchorWallet}`);
      return out("anchored", { ...facts, anchor: withLink(proof.evidence, anchorCluster) });
    }
    reasons.push("no anchor memo from the configured anchor wallet");
  }
  if (origin === "draft" || origin === "sent") {
    reasons.push(`found in our own ${origin} mail`);
    return out("self_written_unanchored", facts);
  }
  reasons.push(origin === "inbound" ? "inbound mail can never supply a prior wallet" : "origin unknown; pass --origin draft|sent|inbound");
  return out("untrusted", facts);
}

// ---------- payout gate ----------
// Turns a verdict plus the user's intended payment into ALLOW_WITH_USER_APPROVAL, HOLD or BLOCK.
// It never approves on its own: the best outcome still needs the user's explicit yes in mermail-agent-wallet.
export const CALLBACK_THRESHOLD_USD = 1000;
export const SPLIT_WINDOW_DAYS = 7;
export const LOST_WALLET_HOLD_H = 72;
export const VERDICT_MAX_AGE_H = 24;
const TESTNETS = new Set(["devnet", "testnet", "base-sepolia"]);

export function gate({ verdict, amountUsd, paymentCluster, destination, history = [], callbackConfirmed = false, secondChannelAt = null, continuityUnavailable = false, now = Date.now() }) {
  const reasons = [];
  const nowS = Math.floor(now / 1000);
  const amount = Number(amountUsd);
  const payCluster = paymentCluster ?? verdict?.cluster;
  const result = (decision, extra = {}) => ({
    type: "countersig.gate",
    version: VERSION,
    decision,
    destination: verdict?.claimed ?? null,
    cluster: payCluster ?? null,
    amountUsd: Number.isFinite(amount) ? amount : null,
    reasons,
    ...extra,
  });

  if (!verdict || verdict.type !== "countersig.verdict") return (reasons.push("input is not a countersig verdict"), result("BLOCK"));
  if (!Number.isFinite(amount) || amount <= 0) return (reasons.push("amount must come from the user as a positive USD figure"), result("BLOCK"));
  if (destination && !sameAddress(destination, verdict.claimed)) {
    reasons.push("payment destination differs from the verified wallet");
    return result("BLOCK");
  }
  if (["MISMATCH", "LOOKALIKE"].includes(verdict.verdict)) return (reasons.push(`${verdict.verdict} is a hard stop`), result("BLOCK"));
  if (["EXPIRED", "INVALID_ADDRESS", "INVALID_INPUT"].includes(verdict.verdict)) return (reasons.push(`${verdict.verdict}: issue a new challenge`), result("BLOCK"));
  if (verdict.verdict === "UNCHANGED") return (reasons.push("wallet unchanged; normal payment approval applies"), result("ALLOW_WITH_USER_APPROVAL"));
  if (verdict.verdict === "PENDING") return (reasons.push(`proof incomplete: ${(verdict.missing ?? []).join(", ") || "missing rung"}`), result("HOLD"));

  if (payCluster !== verdict.cluster) {
    const rehearsal = TESTNETS.has(verdict.cluster) && !TESTNETS.has(payCluster);
    reasons.push(rehearsal ? `a ${verdict.cluster} proof is a rehearsal and cannot unlock a ${payCluster} payment` : `proof is on ${verdict.cluster} but payment is on ${payCluster}`);
    return result("BLOCK");
  }
  const checkedS = Math.floor(Date.parse(verdict.checkedAt) / 1000);
  if (!Number.isFinite(checkedS) || nowS - checkedS > VERDICT_MAX_AGE_H * 3600) {
    reasons.push(`verdict is older than ${VERDICT_MAX_AGE_H} h; run verify again before paying`);
    return result("HOLD");
  }

  const windowStart = nowS - SPLIT_WINDOW_DAYS * 86400;
  const recent = history.filter((h) => sameAddress(String(h.to ?? ""), verdict.claimed) && Math.floor(Date.parse(h.at) / 1000) >= windowStart);
  const totalUsd7d = recent.reduce((sum, h) => sum + (Number(h.amountUsd) || 0), amount);
  const extra = { totalUsd7d, priorPayments7d: recent.length };

  if (verdict.verdict === "VERIFIED_CONTINUITY") {
    reasons.push("new wallet signed and the prior wallet countersigned");
    return result("ALLOW_WITH_USER_APPROVAL", extra);
  }

  // VERIFIED_CHANNEL: first contact, or continuity unavailable because the old key is lost
  const holds = [];
  // A call-back to a phone number the user already had is stronger than waiting, so it replaces the first-contact cool-off.
  // It never replaces the lost-wallet hold below, which needs a second written channel and time.
  if (verdict.coolOffUntil && Date.parse(verdict.coolOffUntil) > now) {
    if (callbackConfirmed && !continuityUnavailable) reasons.push("call-back confirmed; first-contact cool-off waived");
    else holds.push(verdict.coolOffUntil);
  }
  if (continuityUnavailable) {
    if (!secondChannelAt || !Number.isFinite(Date.parse(secondChannelAt))) {
      reasons.push("old wallet unavailable: needs confirmation from a second, independently trusted channel");
      return result("HOLD", extra);
    }
    const base = Math.max(Date.parse(secondChannelAt), (verdict.evidence?.control?.blockTime ?? 0) * 1000);
    const until = base + LOST_WALLET_HOLD_H * 3600 * 1000;
    if (until > now) holds.push(new Date(until).toISOString());
  }
  if (totalUsd7d >= CALLBACK_THRESHOLD_USD && !callbackConfirmed) {
    reasons.push(`first contact with ${totalUsd7d} USD over ${SPLIT_WINDOW_DAYS} days needs a call-back to a phone number the user already has`);
    return result("HOLD", { ...extra, holdUntil: holds.sort().at(-1) ?? null });
  }
  if (holds.length) {
    const holdUntil = holds.sort().at(-1);
    reasons.push(`hold until ${holdUntil}`);
    return result("HOLD", { ...extra, holdUntil });
  }
  reasons.push(continuityUnavailable ? "control proven, second channel confirmed, hold elapsed" : "control proven and cool-off elapsed");
  return result("ALLOW_WITH_USER_APPROVAL", extra);
}

// ---------- signing (payee test helper + anchor) ----------
const PKCS8_ED25519 = Buffer.from("302e020100300506032b657004220420", "hex");
export async function loadKeypair(path) {
  const raw = (await readFile(path, "utf8")).replace(/^﻿/, "").trim();
  const secret = raw.startsWith("[") ? Uint8Array.from(JSON.parse(raw)) : b58decode(raw);
  if (secret.length !== 64) throw new Error("keypair must be 64 bytes (solana-keygen JSON array or base58)");
  const privateKey = createPrivateKey({ key: Buffer.concat([PKCS8_ED25519, Buffer.from(secret.slice(0, 32))]), format: "der", type: "pkcs8" });
  const derived = createPublicKey(privateKey).export({ format: "der", type: "spki" }).subarray(-32);
  if (!Buffer.from(secret.slice(32)).equals(derived)) throw new Error("keypair public half does not match its secret");
  return { privateKey, publicKey: Uint8Array.from(derived), address: b58encode(derived) };
}
const compactU16 = (n) => {
  const out = [];
  let v = n;
  for (;;) {
    const byte = v & 0x7f;
    v >>= 7;
    if (v === 0) {
      out.push(byte);
      return out;
    }
    out.push(byte | 0x80);
  }
};
export async function sendMemo({ keypair, memo, cluster = "devnet", rpcUrl }) {
  const url = rpcUrl ?? RPC[cluster];
  const { value } = await rpc(url, "getLatestBlockhash", [{ commitment: "confirmed" }]);
  const data = Buffer.from(memo, "utf8");
  if (data.length > 566) throw new Error("memo too long");
  const message = Buffer.from([
    1, 0, 1, // header: 1 signer, 0 readonly signed, 1 readonly unsigned
    ...compactU16(2),
    ...keypair.publicKey,
    ...b58decode(MEMO_PROGRAM),
    ...b58decode(value.blockhash),
    ...compactU16(1),
    1, // program id index
    ...compactU16(1), 0, // memo lists the payer as signer
    ...compactU16(data.length),
    ...data,
  ]);
  const signature = edSign(null, message, keypair.privateKey);
  const wire = Buffer.concat([Buffer.from(compactU16(1)), signature, message]);
  const txSig = await rpc(url, "sendTransaction", [wire.toString("base64"), { encoding: "base64", preflightCommitment: "confirmed" }]);
  for (let i = 0; i < 60; i += 1) {
    const { value: statuses } = await rpc(url, "getSignatureStatuses", [[txSig]]);
    const status = statuses[0];
    if (status?.err) throw new Error(`transaction failed: ${JSON.stringify(status.err)}`);
    if (status && ["confirmed", "finalized"].includes(status.confirmationStatus)) {
      return { signature: txSig, slot: status.slot, explorer: explorer(txSig, cluster), signer: keypair.address, memo };
    }
    await sleep(1000);
  }
  throw new Error(`not confirmed in time: ${txSig}`);
}

// ---------- CLI ----------
function parseArgs(argv) {
  const [command, ...rest] = argv;
  const args = {};
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (!token.startsWith("--")) throw new Error(`unexpected argument ${token}`);
    const key = token.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const next = rest[i + 1];
    if (next === undefined || next.startsWith("--")) args[key] = true;
    else {
      args[key] = next;
      i += 1;
    }
  }
  return { command, args };
}
const need = (args, ...keys) => {
  const missing = keys.filter((k) => args[k] === undefined || args[k] === true);
  if (missing.length) throw new Error(`missing --${missing.map((k) => k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)).join(", --")}`);
};
const readJson = async (path) => JSON.parse((await readFile(path, "utf8")).replace(/^﻿/, ""));

async function main() {
  const { command, args } = parseArgs(process.argv.slice(2));
  const cluster = args.cluster ?? "devnet";
  if (args.cluster && !RPC[cluster] && !isEvmChain(cluster)) throw new Error(`--cluster must be one of ${[...Object.keys(RPC), ...Object.keys(EVM_CHAINS)].join(", ")}`);
  const mainnet = cluster === "mainnet-beta" || cluster === "base";
  const out = (value, code = 0) => {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
    process.exitCode = code;
  };
  switch (command) {
    case "challenge": {
      need(args, "claimed", "channel");
      const record = challenge({ claimed: args.claimed, channel: args.channel, counterparty: args.counterparty, prior: args.prior, cluster, ttlHours: Number(args.ttlHours ?? 72), signerBase: args.signerBase });
      if (args.out) await writeFile(args.out, `${JSON.stringify(record, null, 2)}\n`);
      return out(record);
    }
    case "verify": {
      let input = args;
      if (args.challengeFile) {
        const c = await readJson(args.challengeFile);
        input = { claimed: c.claimed, prior: c.prior, nonce: c.nonce, issuedAt: c.issuedAt, expiresAt: c.expiresAt, cluster: c.cluster, ...args };
      }
      need(input, "claimed", "nonce", "issuedAt", "expiresAt");
      const result = await verify({ ...input, cluster: input.cluster ?? cluster, known: typeof args.known === "string" ? args.known.split(",").map((s) => s.trim()) : [], rpc: args.rpc });
      if (args.out) await writeFile(args.out, `${JSON.stringify(result, null, 2)}\n`);
      const code = result.verdict.startsWith("VERIFIED") ? 0 : result.verdict === "PENDING" ? 2 : 3;
      return out(result, code);
    }
    case "receipt": {
      need(args, "verdictFile", "challengeFile");
      const result = receipt(await readJson(args.verdictFile), await readJson(args.challengeFile));
      if (args.out) await writeFile(args.out, `${JSON.stringify(result, null, 2)}\n`);
      return out(result);
    }
    case "receipt-check": {
      need(args, "textFile");
      const result = await checkReceipt({ text: await readFile(args.textFile, "utf8"), origin: args.origin, anchorWallet: args.anchorWallet, anchorCluster: cluster, rpcUrl: args.rpc });
      if (args.out) await writeFile(args.out, `${JSON.stringify(result, null, 2)}\n`);
      return out(result, { anchored: 0, self_written_unanchored: 2, untrusted: 3 }[result.level]);
    }
    case "gate": {
      need(args, "verdictFile", "amountUsd");
      const result = gate({
        verdict: await readJson(args.verdictFile),
        amountUsd: args.amountUsd,
        paymentCluster: args.paymentCluster,
        destination: args.destination,
        history: args.historyFile ? await readJson(args.historyFile) : [],
        callbackConfirmed: args.callbackConfirmed === true,
        continuityUnavailable: args.continuityUnavailable === true,
        secondChannelAt: args.secondChannelAt,
      });
      if (args.out) await writeFile(args.out, `${JSON.stringify(result, null, 2)}\n`);
      return out(result, { ALLOW_WITH_USER_APPROVAL: 0, HOLD: 2, BLOCK: 3 }[result.decision]);
    }
    case "anchor": {
      need(args, "receiptFile", "keypair");
      if (mainnet && !args.allowMainnet) throw new Error("anchoring on mainnet needs --allow-mainnet");
      const file = await readJson(args.receiptFile);
      const sha = file.sha256 ?? createHash("sha256").update(canonical(file.receipt ?? file)).digest("hex");
      const sent = isEvmChain(cluster)
        ? await sendEvmMemo({ key: await loadEvmKey(args.keypair), memo: receiptMemo(sha), cluster, rpcUrl: args.rpc })
        : await sendMemo({ keypair: await loadKeypair(args.keypair), memo: receiptMemo(sha), cluster, rpcUrl: args.rpc });
      return out({ type: "countersig.anchor", sha256: sha, ...sent });
    }
    case "sign": {
      need(args, "keypair", "memo");
      if (mainnet && !args.allowMainnet) throw new Error("signing on mainnet needs --allow-mainnet");
      if (!String(args.memo).startsWith(`countersig:${VERSION}:`)) throw new Error("sign only sends Countersig memos");
      if (isEvmChain(cluster)) return out({ type: "countersig.signed", ...(await sendEvmMemo({ key: await loadEvmKey(args.keypair), memo: args.memo, cluster, rpcUrl: args.rpc })) });
      return out({ type: "countersig.signed", ...(await sendMemo({ keypair: await loadKeypair(args.keypair), memo: args.memo, cluster, rpcUrl: args.rpc })) });
    }
    case "keygen": {
      need(args, "out");
      if (isEvmChain(cluster)) {
        const key = newEvmKey();
        await writeFile(args.out, JSON.stringify({ privateKey: key.privateKey }));
        return out({ type: "countersig.keygen", address: key.address, path: args.out, note: "throwaway key for Base Sepolia testing only" });
      }
      const { privateKey, publicKey } = generateKeyPairSync("ed25519");
      const seed = privateKey.export({ format: "der", type: "pkcs8" }).subarray(-32);
      const pub = publicKey.export({ format: "der", type: "spki" }).subarray(-32);
      await writeFile(args.out, JSON.stringify([...seed, ...pub]));
      return out({ type: "countersig.keygen", address: b58encode(pub), path: args.out, note: "throwaway key for devnet testing only" });
    }
    default:
      throw new Error("usage: countersig.mjs <challenge|verify|gate|receipt|receipt-check|anchor|sign|keygen> [--flags]");
  }
}

// Run the CLI only when this file is the entry point, not when a test or another script imports it.
const isEntry = () => {
  try {
    return Boolean(process.argv[1]) && realpathSync(path.resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
};
if (isEntry()) {
  main().catch((error) => {
    process.stdout.write(`${JSON.stringify({ type: "countersig.error", error: error.message }, null, 2)}\n`);
    process.exitCode = 1;
  });
}
