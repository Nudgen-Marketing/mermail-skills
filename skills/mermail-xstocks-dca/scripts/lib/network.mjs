import process from "node:process";
import { DcaError } from "./core.mjs";

export const CATALOG = "https://xstock.mermail.app";
const DEFAULT_RPC = "https://api.mainnet-beta.solana.com";
const sleep = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

async function fetchJson(url, init = {}) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new DcaError("http_status", `${response.status} ${url}`);
  return response.json();
}

// Reads the published xStocks catalog for every leg. A leg that cannot be read is simply
// absent, and the planner refuses it as verification_unavailable.
export async function observeCatalog(mandate) {
  const verification = {};
  for (const leg of mandate.legs) {
    const base = `${CATALOG}/api/v1/products/${encodeURIComponent(leg.productId)}`;
    try {
      const product = (await fetchJson(base)).data;
      let check = (await fetchJson(`${base}/verification?network=Solana`)).data;
      if (check.status === "unknown" && check.retryable && Number.isFinite(check.retryAfterMs)) {
        await sleep(Math.min(check.retryAfterMs, 2000));
        check = (await fetchJson(`${base}/verification?network=Solana`)).data;
      }
      verification[leg.mint] = {
        status: check.status,
        mint: check.mint,
        identityVerified: check.identity?.verified === true,
        halted: product.isTradingHalted !== false || product.active !== true || product.tradingStatusKnown !== true,
        scaledUiAmount: check.executionContext?.scaledUiAmount ?? null,
      };
    } catch {
      // leave the leg unobserved
    }
  }
  return verification;
}

export async function fetchTransaction(signature, { attempts = 6, delayMs = 2000 } = {}) {
  const rpcUrl = process.env.SOLANA_RPC_URL ?? DEFAULT_RPC;
  const body = JSON.stringify({
    jsonrpc: "2.0", id: 1, method: "getTransaction",
    params: [signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0, commitment: "confirmed" }],
  });
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const reply = await fetchJson(rpcUrl, { method: "POST", headers: { "content-type": "application/json" }, body });
    if (reply.result) return reply.result;
    if (attempt < attempts - 1) await sleep(delayMs);
  }
  return null;
}
