// Offline tests for mermail-countersig: payout gate policy, red-team cases against a local mock JSON-RPC,
// and a golden corpus of real Solana devnet and Base Sepolia responses.
// Run: node tests/countersig.mjs  (also part of npm test; no network, no keys)
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { challenge, checkReceipt, gate, lookalikes, receipt, receiptMemo, verify } from "../skills/mermail-countersig/scripts/countersig.mjs";
import { findEvmProof } from "../skills/mermail-countersig/scripts/evm.mjs";

// ---------- payout gate ----------
const NOW = Date.parse("2026-09-15T12:00:00Z");
const iso = (h) => new Date(NOW + h * 3600 * 1000).toISOString();
const W = "5xqQGYCkXE6mA5Djh4phvzE1xHMRqm4K33uacNg86qJ9";
const v = (verdict, extra = {}) => ({ type: "countersig.verdict", verdict, cluster: "mainnet-beta", claimed: W, checkedAt: iso(-1), ...extra });
const channel = (extra = {}) => v("VERIFIED_CHANNEL", { coolOffUntil: iso(-2), evidence: { control: { blockTime: (NOW - 30 * 3600 * 1000) / 1000 } }, ...extra });

const gateCases = [
  ["continuity pays with approval", { verdict: v("VERIFIED_CONTINUITY"), amountUsd: 40000 }, "ALLOW_WITH_USER_APPROVAL"],
  ["mismatch is a hard stop", { verdict: v("MISMATCH"), amountUsd: 10 }, "BLOCK"],
  ["lookalike is a hard stop", { verdict: v("LOOKALIKE"), amountUsd: 10 }, "BLOCK"],
  ["pending holds", { verdict: v("PENDING", { missing: ["rotation"] }), amountUsd: 10 }, "HOLD"],
  ["expired blocks", { verdict: v("EXPIRED"), amountUsd: 10 }, "BLOCK"],
  ["devnet proof cannot unlock mainnet", { verdict: v("VERIFIED_CONTINUITY", { cluster: "devnet" }), amountUsd: 10, paymentCluster: "mainnet-beta" }, "BLOCK"],
  ["solana proof cannot unlock base", { verdict: v("VERIFIED_CONTINUITY"), amountUsd: 10, paymentCluster: "base" }, "BLOCK"],
  ["different destination blocks", { verdict: v("VERIFIED_CONTINUITY"), amountUsd: 10, destination: "66ahMx2mUV3a4X2Hyoe6SXv4tBmmCtariKvvyCZ8sv98" }, "BLOCK"],
  ["stale verdict holds", { verdict: v("VERIFIED_CONTINUITY", { checkedAt: iso(-30) }), amountUsd: 10 }, "HOLD"],
  ["missing amount blocks", { verdict: v("VERIFIED_CONTINUITY"), amountUsd: "" }, "BLOCK"],
  ["first contact small after cool-off", { verdict: channel(), amountUsd: 900 }, "ALLOW_WITH_USER_APPROVAL"],
  ["first contact inside cool-off holds", { verdict: channel({ coolOffUntil: iso(5) }), amountUsd: 900 }, "HOLD"],
  ["call-back replaces the first-contact cool-off", { verdict: channel({ coolOffUntil: iso(5) }), amountUsd: 900, callbackConfirmed: true }, "ALLOW_WITH_USER_APPROVAL"],
  ["call-back does not replace the lost-wallet hold", { verdict: channel({ coolOffUntil: iso(5) }), amountUsd: 500, callbackConfirmed: true, continuityUnavailable: true, secondChannelAt: iso(-10) }, "HOLD"],
  ["first contact large needs call-back", { verdict: channel(), amountUsd: 5000 }, "HOLD"],
  ["first contact large with call-back", { verdict: channel(), amountUsd: 5000, callbackConfirmed: true }, "ALLOW_WITH_USER_APPROVAL"],
  ["split payments are summed", { verdict: channel(), amountUsd: 900, history: [{ to: W, amountUsd: 900, at: iso(-24) }] }, "HOLD"],
  ["old split outside 7 days ignored", { verdict: channel(), amountUsd: 900, history: [{ to: W, amountUsd: 900, at: iso(-24 * 8) }] }, "ALLOW_WITH_USER_APPROVAL"],
  ["lost wallet without second channel holds", { verdict: channel(), amountUsd: 500, continuityUnavailable: true }, "HOLD"],
  ["lost wallet inside 72 h holds", { verdict: channel(), amountUsd: 500, continuityUnavailable: true, secondChannelAt: iso(-10) }, "HOLD"],
  ["lost wallet after 72 h allows", { verdict: channel({ evidence: { control: { blockTime: (NOW - 100 * 3600 * 1000) / 1000 } } }), amountUsd: 500, continuityUnavailable: true, secondChannelAt: iso(-80) }, "ALLOW_WITH_USER_APPROVAL"],
  ["72 h counts from the later proof", { verdict: channel(), amountUsd: 500, continuityUnavailable: true, secondChannelAt: iso(-80) }, "HOLD"],
  ["not a verdict blocks", { verdict: { claimed: W }, amountUsd: 10 }, "BLOCK"],
];

// ---------- red-team ----------
const NOW_S = Math.floor(Date.now() / 1000);
const PRIOR = "66ahMx2mUV3a4X2Hyoe6SXv4tBmmCtariKvvyCZ8sv98";
const CLAIMED = "5xqQGYCkXE6mA5Djh4phvzE1xHMRqm4K33uacNg86qJ9";
const ATTACKER = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const ANCHOR = "Cs7CFiRrdAdgXEuNcYGhYKuZwEdMkbFqyu5UxA3qwrTN";
const NONCE = "6ENQ1W0CBV8Q94TB";

// state is swapped per case
let chain = { sigs: {}, txs: {}, evm: {} };
const server = createServer(async (req, res) => {
  let body = "";
  for await (const c of req) body += c;
  const { method, params } = JSON.parse(body);
  let result = null;
  if (method === "getSignaturesForAddress") {
    const [addr, { limit, before }] = params;
    const all = chain.sigs[addr] ?? [];
    const start = before ? all.findIndex((s) => s.signature === before) + 1 : 0;
    result = all.slice(start, start + limit);
  } else if (method === "getTransaction") result = chain.txs[params[0]] ?? null;
  else if (method === "eth_getTransactionByHash") result = chain.evm[params[0]]?.tx ?? null;
  else if (method === "eth_getTransactionReceipt") result = chain.evm[params[0]]?.receipt ?? null;
  else if (method === "eth_getBlockByNumber") result = { timestamp: `0x${(NOW_S - 60).toString(16)}` };
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ jsonrpc: "2.0", id: 1, result }));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const RPC_URL = `http://127.0.0.1:${server.address().port}`;

const memoTx = (sig, signer, memo, t) => {
  chain.txs[sig] = {
    slot: 1,
    blockTime: t,
    meta: { err: null },
    transaction: { message: { accountKeys: [{ pubkey: signer, signer: true }], instructions: [{ programId: "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr", parsed: memo }] } },
  };
  return { signature: sig, blockTime: t, memo: `[${memo.length}] ${memo}` };
};
const noise = (n, t) => Array.from({ length: n }, (_, i) => ({ signature: `spam${i}`, blockTime: t, memo: null }));
const base = { claimed: CLAIMED, prior: PRIOR, nonce: NONCE, issuedAt: new Date((NOW_S - 3600) * 1000).toISOString(), expiresAt: new Date((NOW_S + 3600) * 1000).toISOString(), cluster: "devnet", rpc: RPC_URL };

const attackCases = [];
const check = (name, got, expected) => attackCases.push([name, got, expected]);

// 1. Flood hides a conflicting endorsement deep in the prior wallet's history
{
  chain = { sigs: {}, txs: {}, evm: {} };
  const ok = memoTx("good", PRIOR, `countersig:v1:${NONCE}:rotate:${CLAIMED}`, NOW_S - 100);
  const bad = memoTx("evil", PRIOR, `countersig:v1:${NONCE}:rotate:${ATTACKER}`, NOW_S - 200);
  chain.sigs[CLAIMED] = [memoTx("ctl", CLAIMED, `countersig:v1:${NONCE}`, NOW_S - 50)];
  chain.sigs[PRIOR] = [ok, ...noise(2500, NOW_S - 150), bad];
  const v = await verify(base);
  check("flood cannot hide a conflicting endorsement", v.verdict, "MISMATCH");
}
// 2. Flood beyond the scan budget fails closed
{
  chain.sigs[PRIOR] = [chain.sigs[PRIOR][0], ...noise(12000, NOW_S - 150)];
  const v = await verify(base);
  check("flood beyond scan budget is never verified", v.verdict, "PENDING");
}
// 3. Normal rotation still verifies
{
  chain.sigs[PRIOR] = [memoTx("good", PRIOR, `countersig:v1:${NONCE}:rotate:${CLAIMED}`, NOW_S - 100), ...noise(30, NOW_S - 150)];
  const v = await verify(base);
  check("legitimate rotation still verifies", v.verdict, "VERIFIED_CONTINUITY");
}
// 4. Attacker memo that only references the prior wallet (not signed by it)
{
  chain.txs.good.transaction.message.accountKeys = [{ pubkey: ATTACKER, signer: true }, { pubkey: PRIOR, signer: false }];
  const v = await verify(base);
  check("memo that merely mentions the prior wallet is not a countersignature", v.verdict, "PENDING");
}

// Receipts
const verdict = { type: "countersig.verdict", verdict: "VERIFIED_CONTINUITY", payable: true, cluster: "devnet", claimed: CLAIMED, prior: PRIOR, nonce: NONCE, checkedAt: new Date((NOW_S - 600) * 1000).toISOString(), evidence: null };
const challengeRecord = { nonce: NONCE, claimed: CLAIMED, counterparty: "Acme", channel: "billing@acme.example", issuedAt: base.issuedAt, expiresAt: base.expiresAt };
const real = receipt(verdict, challengeRecord);
// 5. Attacker emails a well-formed receipt naming their own wallet
{
  const forged = receipt({ ...verdict, claimed: ATTACKER }, { ...challengeRecord, claimed: ATTACKER });
  const r = await checkReceipt({ text: forged.text, origin: "inbound", rpcUrl: RPC_URL });
  check("inbound receipt naming attacker wallet is untrusted", r.level, "untrusted");
}
// 6. Tampered receipt text
{
  const tampered = real.text.replace(/^Wallet: .*/m, `Wallet: ${ATTACKER} (devnet)`).replace(/^Receipt data: (.*)$/m, (_, d) => `Receipt data: ${Buffer.from(Buffer.from(d, "base64url").toString().replace(CLAIMED, ATTACKER)).toString("base64url")}`);
  const r = await checkReceipt({ text: tampered, origin: "draft", rpcUrl: RPC_URL });
  check("edited receipt data fails sha256", r.level, "untrusted");
}
// 7. Our own draft without an anchor needs user confirmation
{
  const r = await checkReceipt({ text: real.text, origin: "draft", rpcUrl: RPC_URL });
  check("own draft without anchor needs user confirmation", r.level, "self_written_unanchored");
}
// 8. Anchored by our anchor wallet
{
  chain.sigs[ANCHOR] = [memoTx("anc", ANCHOR, receiptMemo(real.sha256), NOW_S - 300)];
  const r = await checkReceipt({ text: real.text, origin: "inbound", anchorWallet: ANCHOR, rpcUrl: RPC_URL });
  check("receipt anchored by our wallet is trusted", r.level, "anchored");
}
// 9. Anchor memo signed by someone else
{
  chain.sigs[ANCHOR] = [memoTx("anc2", ATTACKER, receiptMemo(real.sha256), NOW_S - 300)];
  const r = await checkReceipt({ text: real.text, origin: "inbound", anchorWallet: ANCHOR, rpcUrl: RPC_URL });
  check("anchor memo signed by another wallet is untrusted", r.level, "untrusted");
}
// 10. Base: legacy transaction without chain id
{
  const from = "0x1111111111111111111111111111111111111111";
  const memo = `countersig:v1:${NONCE}`;
  chain.evm["0x" + "a".repeat(64)] = { tx: { from, to: from, input: "0x" + Buffer.from(memo).toString("hex") }, receipt: { status: "0x1", blockNumber: "0x10" } };
  const r = await findEvmProof({ cluster: "base-sepolia", rpcUrl: RPC_URL, address: from, expected: memo, txHash: "0x" + "a".repeat(64), notBefore: NOW_S - 3600, notAfter: NOW_S });
  check("Base legacy tx without chain id is rejected", r.found, false);
  chain.evm["0x" + "a".repeat(64)].tx.chainId = "0x14a34";
  const r2 = await findEvmProof({ cluster: "base-sepolia", rpcUrl: RPC_URL, address: from, expected: memo, txHash: "0x" + "a".repeat(64), notBefore: NOW_S - 3600, notAfter: NOW_S });
  check("Base tx with matching chain id is accepted", r2.found, true);
}

server.close();

// ---------- formats ----------
const unitCases = [];
{
  const c = challenge({ claimed: "5xqQGYCkXE6mA5Djh4phvzE1xHMRqm4K33uacNg86qJ9", prior: "66ahMx2mUV3a4X2Hyoe6SXv4tBmmCtariKvvyCZ8sv98", channel: "billing@vendor.example", counterparty: "Vendor" });
  unitCases.push(["nonce is 16 Crockford characters", /^[0-9A-HJKMNP-TV-Z]{16}$/.test(c.nonce), true]);
  unitCases.push(["challenge email goes only to the trusted channel", c.email.to, "billing@vendor.example"]);
  unitCases.push(["rotation memo binds the claimed wallet", c.memoRotate.endsWith(":rotate:5xqQGYCkXE6mA5Djh4phvzE1xHMRqm4K33uacNg86qJ9"), true]);
  const nonces = new Set(Array.from({ length: 500 }, () => challenge({ claimed: c.claimed, channel: c.channel }).nonce));
  unitCases.push(["500 challenges give 500 distinct nonces", nonces.size, 500]);
  unitCases.push(["EVM lookalike check ignores case", lookalikes("0xAbCd00000000000000000000000000000000beef", ["0xabcd11111111111111111111111111111111BEEF"]).length, 1]);
  let threw = false;
  try { challenge({ claimed: c.claimed, channel: "a@b.example, attacker@evil.example" }); } catch { threw = true; }
  unitCases.push(["challenge refuses more than one recipient", threw, true]);
}

// ---------- golden corpus ----------
// Real Solana devnet and Base Sepolia RPC responses (tests/fixtures/countersig-golden.json), replayed offline.
// A request that was not recorded fails the case, so a behaviour change cannot pass silently.
const golden = JSON.parse(await readFile(new URL("./fixtures/countersig-golden.json", import.meta.url), "utf8"));
const goldenCases = [];
{
  const unrecorded = [];
  const replay = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const net = req.url.includes("base") ? "base" : "solana";
    const { method, params } = JSON.parse(body);
    const k = `${method} ${JSON.stringify(params)}`;
    res.setHeader("content-type", "application/json");
    if (!(k in golden.responses[net])) {
      unrecorded.push(k.slice(0, 80));
      res.end(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32000, message: "not in golden corpus" } }));
      return;
    }
    res.end(JSON.stringify({ jsonrpc: "2.0", id: 1, result: golden.responses[net][k] }));
  });
  await new Promise((ok) => replay.listen(0, "127.0.0.1", ok));
  const port = replay.address().port;
  for (const c of golden.cases) {
    let verdict;
    try {
      verdict = (await verify({ ...c.input, rpc: `http://127.0.0.1:${port}/${c.net}`, now: c.now })).verdict;
    } catch (error) {
      verdict = `error: ${error.message}`;
    }
    goldenCases.push([`golden ${c.name}`, verdict, c.expected]);
  }
  replay.close();
  goldenCases.push(["golden corpus needed no unrecorded RPC call", unrecorded.length, 0]);
}

let failed = 0;
const report = (label, rows, pick) => {
  for (const row of rows) {
    const [name, got, expected] = pick(row);
    const ok = got === expected;
    if (!ok) failed += 1;
    if (!ok) console.log(`FAIL  ${label}: ${name} -> ${got} (expected ${expected})`);
  }
};
report("gate", gateCases, ([name, input, expected]) => [name, gate({ ...input, now: NOW }).decision, expected]);
report("red-team", attackCases, (r) => r);
report("format", unitCases, (r) => r);
report("golden", goldenCases, (r) => r);
const total = gateCases.length + attackCases.length + unitCases.length + goldenCases.length;
console.log(`Countersig: ${total - failed} of ${total} checks pass (${gateCases.length} gate, ${attackCases.length} red-team, ${unitCases.length} format, ${goldenCases.length} golden).`);
process.exitCode = failed ? 1 : 0;
