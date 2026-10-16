import { readFileSync } from "node:fs";

export const SPY_MINT = "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W";
export const NVDA_MINT = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";
export const WALLET = "7VA3n2q4rxv9rKrVEWJPdoa5pSAS8xku5ECnP6VbbCts";
export const SPIKE_TX = "5LrQLr2J4rNttraS4Q29T3yfQDJjvNbKFyaurV37QquNS3eSB6t6Vdts4V21r1G493EuTmtLjRi1kgAZcQG7rZJC";
export const ANCHOR = "2026-10-06T10:00:00Z";

export const at = (minutes) => new Date(Date.parse(ANCHOR) + minutes * 60_000).toISOString();

export function mandate() {
  return {
    schema: "mermail-xstocks-dca/mandate@1",
    owner: { email: "owner@example.com" },
    mailbox: { publicId: "08c988ac-f3ad-464e-b85a-fe178ea9bf69", email: "desk@mermail.app" },
    wallet: { credentialId: "cred-sol-1", address: WALLET, network: "solana" },
    legs: [
      { symbol: "SPYx", productId: "cmugraxb700pu1ws5p1n2y3nj", mint: SPY_MINT, sliceUsdc: "0.25" },
      { symbol: "NVDAx", productId: "cmugr89b700k51ws5xkdw5ivi", mint: NVDA_MINT, sliceUsdc: "0.25" },
    ],
    cadence: { every: "PT3M", anchor: ANCHOR },
    caps: { perSliceUsdc: "0.50", window: { duration: "P1D", maxUsdc: "1.50" }, totalUsdc: "2.00" },
    guards: { maxSlippageBps: 100 },
    reports: { statementEvery: "PT15M" },
    validFrom: ANCHOR,
    expiresAt: "2026-10-07T10:00:00Z",
  };
}

export const verified = (mint, extra = {}) => ({ status: "verified", mint, identityVerified: true, halted: false, ...extra });
export const allVerified = () => ({ [SPY_MINT]: verified(SPY_MINT), [NVDA_MINT]: verified(NVDA_MINT) });

export const spikeTx = () => JSON.parse(readFileSync(new URL("./spike-swap-tx.json", import.meta.url), "utf8"));
