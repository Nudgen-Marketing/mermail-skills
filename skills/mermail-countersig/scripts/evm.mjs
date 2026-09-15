// Countersig on Base (EVM). Zero dependencies: keccak-256, secp256k1 signing, RLP and EIP-1559 are implemented here.
// Proof shape on EVM: the wallet sends a 0-value transaction to itself whose calldata is the UTF-8 memo.
// EVM RPC cannot list transactions by address, so the payee replies with the transaction hash and we verify that hash.
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";

export const EVM_CHAINS = {
  "base-sepolia": { chainId: 84532, rpc: "https://sepolia.base.org", explorer: "https://sepolia.basescan.org" },
  base: { chainId: 8453, rpc: "https://mainnet.base.org", explorer: "https://basescan.org" },
};
export const isEvmChain = (cluster) => Object.hasOwn(EVM_CHAINS, cluster);
export const isEvmAddress = (text) => typeof text === "string" && /^0x[0-9a-fA-F]{40}$/.test(text);
export const isTxHash = (text) => typeof text === "string" && /^0x[0-9a-fA-F]{64}$/.test(text);
export const evmExplorer = (hash, cluster) => `${EVM_CHAINS[cluster].explorer}/tx/${hash}`;

// ---------- keccak-256 ----------
const MASK = (1n << 64n) - 1n;
const RC = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n, 0x000000000000808bn, 0x0000000080000001n,
  0x8000000080008081n, 0x8000000000008009n, 0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n, 0x8000000000008002n, 0x8000000000000080n,
  0x000000000000800an, 0x800000008000000an, 0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];
const ROT = [0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18, 2, 61, 56, 14];
const rotl = (x, n) => (n === 0 ? x : ((x << BigInt(n)) | (x >> BigInt(64 - n))) & MASK);
function keccakF(s) {
  for (let round = 0; round < 24; round += 1) {
    const c = [0, 1, 2, 3, 4].map((x) => s[x] ^ s[x + 5] ^ s[x + 10] ^ s[x + 15] ^ s[x + 20]);
    for (let i = 0; i < 25; i += 1) s[i] ^= c[(i % 5 + 4) % 5] ^ rotl(c[(i % 5 + 1) % 5], 1);
    const b = new Array(25);
    for (let x = 0; x < 5; x += 1) for (let y = 0; y < 5; y += 1) b[y + ((2 * x + 3 * y) % 5) * 5] = rotl(s[x + y * 5], ROT[x + y * 5]);
    for (let i = 0; i < 25; i += 1) s[i] = b[i] ^ (~b[(i % 5 + 1) % 5 + i - (i % 5)] & MASK & b[(i % 5 + 2) % 5 + i - (i % 5)]);
    s[0] ^= RC[round];
  }
}
export function keccak256(input) {
  const data = typeof input === "string" ? Buffer.from(input, "utf8") : Buffer.from(input);
  const rate = 136;
  const padded = Buffer.alloc(Math.floor(data.length / rate) * rate + rate);
  data.copy(padded);
  padded[data.length] ^= 0x01;
  padded[padded.length - 1] ^= 0x80;
  const s = new Array(25).fill(0n);
  for (let off = 0; off < padded.length; off += rate) {
    for (let i = 0; i < rate / 8; i += 1) s[i] ^= padded.readBigUInt64LE(off + i * 8);
    keccakF(s);
  }
  const out = Buffer.alloc(32);
  for (let i = 0; i < 4; i += 1) out.writeBigUInt64LE(s[i], i * 8);
  return out;
}

// ---------- secp256k1 ----------
const P = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const G = [0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n, 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n];
const mod = (a, m) => ((a % m) + m) % m;
function inv(a, m) {
  let [x, y, u, v] = [0n, 1n, m, mod(a, m)];
  while (v) { const q = u / v; [x, y] = [y, x - q * y]; [u, v] = [v, u - q * v]; }
  return mod(x, m);
}
function add(p1, p2) {
  if (!p1) return p2;
  if (!p2) return p1;
  if (p1[0] === p2[0] && mod(p1[1] + p2[1], P) === 0n) return null;
  const l = p1[0] === p2[0] ? mod(3n * p1[0] * p1[0] * inv(2n * p1[1], P), P) : mod((p2[1] - p1[1]) * inv(p2[0] - p1[0], P), P);
  const x = mod(l * l - p1[0] - p2[0], P);
  return [x, mod(l * (p1[0] - x) - p1[1], P)];
}
function mul(k, point = G) {
  let r = null;
  for (let q = point; k > 0n; k >>= 1n, q = add(q, q)) if (k & 1n) r = add(r, q);
  return r;
}
const toBig = (bytes) => BigInt(`0x${Buffer.from(bytes).toString("hex") || "0"}`);
const to32 = (n) => Buffer.from(n.toString(16).padStart(64, "0"), "hex");
export function addressFromPrivateKey(secret) {
  const [x, y] = mul(toBig(secret));
  return checksum(`0x${keccak256(Buffer.concat([to32(x), to32(y)])).subarray(12).toString("hex")}`);
}
export function checksum(address) {
  const lower = address.slice(2).toLowerCase();
  const hash = keccak256(lower).toString("hex");
  return `0x${[...lower].map((c, i) => (parseInt(hash[i], 16) >= 8 ? c.toUpperCase() : c)).join("")}`;
}
export function signHash(hash, secret) {
  const d = toBig(secret), z = toBig(hash);
  for (;;) {
    const k = mod(toBig(randomBytes(32)), N);
    if (k === 0n) continue;
    const R = mul(k);
    const r = mod(R[0], N);
    if (r === 0n) continue;
    let s = mod(inv(k, N) * (z + r * d), N);
    if (s === 0n) continue;
    let yParity = Number(R[1] & 1n);
    if (s > N / 2n) { s = N - s; yParity ^= 1; }
    return { r, s, yParity };
  }
}

// ---------- RLP + EIP-1559 ----------
const intBytes = (n) => (BigInt(n) === 0n ? Buffer.alloc(0) : Buffer.from(BigInt(n).toString(16).padStart(Math.ceil(BigInt(n).toString(16).length / 2) * 2, "0"), "hex"));
const lenPrefix = (len, short) => (len < 56 ? Buffer.from([short + len]) : Buffer.concat([Buffer.from([short + 55 + intBytes(len).length]), intBytes(len)]));
export function rlp(item) {
  if (Array.isArray(item)) { const body = Buffer.concat(item.map(rlp)); return Buffer.concat([lenPrefix(body.length, 0xc0), body]); }
  const b = Buffer.from(item);
  return b.length === 1 && b[0] < 0x80 ? b : Buffer.concat([lenPrefix(b.length, 0x80), b]);
}

async function rpc(url, method, params) {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const json = await response.json();
  if (json.error) throw new Error(`${method}: ${json.error.message}`);
  return json.result;
}

export async function loadEvmKey(path) {
  const raw = (await readFile(path, "utf8")).replace(/^﻿/, "").trim();
  const hex = raw.startsWith("{") ? JSON.parse(raw).privateKey : raw;
  if (!/^(0x)?[0-9a-fA-F]{64}$/.test(hex)) throw new Error("EVM key file must hold a 32-byte hex private key");
  const secret = Buffer.from(hex.replace(/^0x/, ""), "hex");
  return { secret, address: addressFromPrivateKey(secret) };
}
export function newEvmKey() {
  const secret = mod(toBig(randomBytes(32)), N - 1n) + 1n;
  const buf = to32(secret);
  return { privateKey: `0x${buf.toString("hex")}`, address: addressFromPrivateKey(buf) };
}

// Send the proof: 0-value self-transfer with the memo as calldata.
export async function sendEvmMemo({ key, memo, cluster, rpcUrl }) {
  const chain = EVM_CHAINS[cluster];
  const url = rpcUrl ?? chain.rpc;
  const data = Buffer.from(memo, "utf8");
  const hexData = `0x${data.toString("hex")}`;
  const [nonce, gasPrice, tip, gas] = await Promise.all([
    rpc(url, "eth_getTransactionCount", [key.address, "pending"]),
    rpc(url, "eth_gasPrice", []),
    rpc(url, "eth_maxPriorityFeePerGas", []).catch(() => "0x5f5e100"),
    rpc(url, "eth_estimateGas", [{ from: key.address, to: key.address, value: "0x0", data: hexData }]),
  ]);
  const maxFee = BigInt(gasPrice) * 2n + BigInt(tip);
  const fields = [intBytes(chain.chainId), intBytes(nonce), intBytes(tip), intBytes(maxFee), intBytes((BigInt(gas) * 12n) / 10n), Buffer.from(key.address.slice(2), "hex"), intBytes(0), data, []];
  const sighash = keccak256(Buffer.concat([Buffer.from([2]), rlp(fields)]));
  const { r, s, yParity } = signHash(sighash, key.secret);
  const raw = Buffer.concat([Buffer.from([2]), rlp([...fields, intBytes(yParity), intBytes(r), intBytes(s)])]);
  const hash = await rpc(url, "eth_sendRawTransaction", [`0x${raw.toString("hex")}`]);
  for (let i = 0; i < 60; i += 1) {
    const receipt = await rpc(url, "eth_getTransactionReceipt", [hash]);
    if (receipt) {
      if (receipt.status !== "0x1") throw new Error(`transaction reverted: ${hash}`);
      return { signature: hash, blockNumber: Number(receipt.blockNumber), explorer: evmExplorer(hash, cluster), signer: key.address, memo };
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`not confirmed in time: ${hash}`);
}

const decodeMemo = (input) => {
  try {
    const text = Buffer.from((input ?? "0x").slice(2), "hex").toString("utf8");
    return /^[\x20-\x7e]*$/.test(text) ? text : null;
  } catch {
    return null;
  }
};

// Check one transaction hash against the expected memo, sender, chain and window.
export async function findEvmProof({ cluster, rpcUrl, address, expected, txHash, notBefore, notAfter, clockSkew = 300 }) {
  if (!txHash) return { found: false, evidence: null, nearMisses: [], scanned: 0 };
  if (!isTxHash(txHash)) return { found: false, evidence: null, nearMisses: [], scanned: 0, error: "not a 32-byte transaction hash" };
  const chain = EVM_CHAINS[cluster];
  const url = rpcUrl ?? chain.rpc;
  const [tx, receipt] = await Promise.all([rpc(url, "eth_getTransactionByHash", [txHash]), rpc(url, "eth_getTransactionReceipt", [txHash])]);
  if (!tx || !receipt) return { found: false, evidence: null, nearMisses: [], scanned: 1, error: "transaction not found or not yet mined" };
  const block = await rpc(url, "eth_getBlockByNumber", [receipt.blockNumber, false]);
  const blockTime = Number(block.timestamp);
  const evidence = {
    signature: txHash,
    blockNumber: Number(receipt.blockNumber),
    blockTime,
    blockTimeIso: new Date(blockTime * 1000).toISOString(),
    memo: decodeMemo(tx.input),
    signedByAddress: tx.from.toLowerCase() === address.toLowerCase(),
    selfSend: tx.to?.toLowerCase() === tx.from.toLowerCase(),
    // Legacy transactions without a chain id can be replayed across chains, so they never count as proof.
    chainIdMatches: tx.chainId != null && Number(tx.chainId) === chain.chainId,
    inWindow: blockTime >= notBefore - clockSkew && blockTime <= notAfter,
    succeeded: receipt.status === "0x1",
  };
  const ok = evidence.memo === expected && evidence.signedByAddress && evidence.chainIdMatches && evidence.inWindow && evidence.succeeded;
  return ok ? { found: true, evidence, nearMisses: [], scanned: 1 } : { found: false, evidence: null, nearMisses: [evidence], scanned: 1 };
}
