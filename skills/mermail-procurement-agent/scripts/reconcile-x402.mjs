#!/usr/bin/env node
// Reconcile an x402 v2 challenge (and optionally its settlement) against a frozen envelope.
// Read-only: it sends one unpaid request (or reads a saved header) and never pays.
//
//   node reconcile-x402.mjs <url> --max 5 --asset 0x8335…2913 --network eip155:8453 [--method POST] [--pay-to 0x…] [--decimals 6]
//   node reconcile-x402.mjs --required <base64 PAYMENT-REQUIRED> --max 5 --asset … --network …
//   node reconcile-x402.mjs --response <base64 PAYMENT-RESPONSE>
//   node reconcile-x402.mjs --self-check
//
// Verdicts: within_envelope | above_cap | asset_mismatch | network_mismatch | payee_mismatch | no_challenge | malformed
// Exit 0 only for within_envelope (or a passing self-check); the JSON report is the output.
import process from "node:process";

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const has = (name) => args.includes(name);

if (has("--self-check")) selfCheck();

const envelope = {
  max: opt("--max"), asset: (opt("--asset") || "").toLowerCase(), network: opt("--network"),
  payTo: (opt("--pay-to") || "").toLowerCase(), decimals: Number(opt("--decimals", 6)),
};

if (has("--response")) {
  report(decodeSettlement(opt("--response")));
}

let required = opt("--required");
const url = args.find((a) => /^https?:\/\//.test(a));
if (!required && url) {
  const method = opt("--method", "GET");
  const res = await fetch(url, { method, headers: { accept: "application/json", "content-type": "application/json" }, body: method === "GET" ? undefined : "{}" });
  required = res.headers.get("payment-required") || res.headers.get("x-payment-required");
  if (!required && res.status === 402) required = Buffer.from(await res.text()).toString("base64");
  if (!required) report({ verdict: "no_challenge", http_status: res.status, url });
}
if (!required) fail("give a URL, --required <base64>, --response <base64>, or --self-check");
report(reconcileChallenge(required, envelope));

function decodeB64Json(b64) {
  try { return JSON.parse(Buffer.from(b64, "base64").toString("utf8")); } catch { return null; }
}

function reconcileChallenge(b64, env) {
  const c = decodeB64Json(b64);
  if (!c || !Array.isArray(c.accepts) || c.accepts.length === 0) return { verdict: "malformed", detail: "PAYMENT-REQUIRED is not base64 JSON with accepts[]" };
  // Prefer the entry matching the envelope's network+asset; otherwise the first — but say so.
  const match = c.accepts.find((a) => a.network === env.network && String(a.asset || "").toLowerCase() === env.asset);
  const a = match || c.accepts[0];
  const amountBase = a.amount ?? a.maxAmountRequired; // v2 `amount`; v1 `maxAmountRequired`
  const amount = Number(amountBase) / Math.pow(10, env.decimals);
  const out = {
    x402Version: c.x402Version ?? null, resource: c.resource?.url ?? a.resource ?? null,
    scheme: a.scheme, network: a.network, asset: a.asset, payTo: a.payTo, amount_base: String(amountBase),
    amount_decimal: amount.toFixed(env.decimals), maxTimeoutSeconds: a.maxTimeoutSeconds ?? null,
    envelope: { max: env.max, asset: env.asset, network: env.network, payTo: env.payTo || null },
    matched_accepts_entry: Boolean(match),
    // ponytail: `upto` authorizes a maximum; settlement may be anything ≤ amount, so the cap check is the same and the receipt check is "at or below".
    amount_semantics: a.scheme === "upto" ? "maximum; settled amount may be 0..amount" : "exact",
  };
  if (!match && env.asset && env.network) return { verdict: c.accepts.some((x) => x.network === env.network) ? "asset_mismatch" : "network_mismatch", ...out };
  if (env.payTo && String(a.payTo).toLowerCase() !== env.payTo) return { verdict: "payee_mismatch", ...out };
  if (env.max !== undefined && !(amount <= Number(env.max))) return { verdict: "above_cap", ...out };
  return { verdict: "within_envelope", ...out };
}

function decodeSettlement(b64) {
  const s = decodeB64Json(b64);
  if (!s || typeof s.success !== "boolean") return { verdict: "malformed", detail: "PAYMENT-RESPONSE is not base64 JSON with success" };
  // The settlement response carries no amount: success, transaction, network, payer. The settled figure must come from the receipt or the chain.
  return { verdict: s.success ? "settlement_reported" : "settlement_failed", success: s.success, transaction: s.transaction ?? null, network: s.network ?? null, payer: s.payer ?? null, errorReason: s.errorReason ?? null, amount: "not carried by PAYMENT-RESPONSE" };
}

function selfCheck() {
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString("base64");
  const usdc = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
  const env = { max: "5", asset: usdc.toLowerCase(), network: "eip155:8453", payTo: "", decimals: 6 };
  const ch = (amount, extra = {}) => enc({ x402Version: 2, accepts: [{ scheme: "exact", network: "eip155:8453", asset: usdc, amount, payTo: "0xEbAFCd94180A67D4a25A46aA1774864C9000895D", ...extra }] });
  const assert = (cond, msg) => { if (!cond) { console.error("self-check failed: " + msg); process.exit(1); } };
  assert(reconcileChallenge(ch("10000"), env).verdict === "within_envelope", "0.01 ≤ 5 should be within");
  assert(reconcileChallenge(ch("5000001"), env).verdict === "above_cap", "5.000001 > 5 should be above_cap");
  assert(reconcileChallenge(ch("5000000"), env).verdict === "within_envelope", "exactly 5 is within (≤)");
  assert(reconcileChallenge(ch("10000"), { ...env, payTo: "0x0000000000000000000000000000000000000001" }).verdict === "payee_mismatch", "payee drift must block");
  assert(reconcileChallenge(ch("10000"), { ...env, network: "eip155:84532" }).verdict === "network_mismatch", "wrong network must block");
  assert(reconcileChallenge(ch("10000", { scheme: "upto" }), env).amount_semantics.startsWith("maximum"), "upto is a maximum");
  assert(reconcileChallenge("not-base64!", env).verdict === "malformed", "garbage is malformed, never within");
  assert(decodeSettlement(enc({ success: true, transaction: "0xabc", network: "eip155:8453", payer: "0xdef" })).amount === "not carried by PAYMENT-RESPONSE", "settlement carries no amount");
  console.log(JSON.stringify({ self_check: "pass", cases: 8 }));
  process.exit(0);
}

function report(result) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.verdict === "within_envelope" || result.verdict === "settlement_reported" ? 0 : 2);
}
function fail(message) { console.error(message); process.exit(1); }
