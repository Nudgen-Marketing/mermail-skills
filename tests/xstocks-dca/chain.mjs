import { appendEntry } from "../../skills/mermail-xstocks-dca/scripts/lib/ledger.mjs";
import { mandateId } from "../../skills/mermail-xstocks-dca/scripts/lib/mandate.mjs";
import { ANCHOR, SPIKE_TX } from "./fixtures.mjs";

export const genesis = (m) => appendEntry([], { at: ANCHOR, kind: "genesis", data: { mandateId: mandateId(m) } }).ledger;

export const push = (ledger, when, kind, slot, leg, data) =>
  appendEntry(ledger, { at: when, kind, slot, leg, data }).ledger;

export function fill(ledger, m, when, slot, leg, amountOutRaw = "31979") {
  const { mint, symbol } = m.legs[leg];
  let next = push(ledger, when, "intent", slot, leg, { amountInRaw: "250000", mint, symbol });
  next = push(next, when, "submitted", slot, leg, { requestId: `req-${slot}-${leg}` });
  return push(next, when, "filled", slot, leg, {
    tx: `${SPIKE_TX.slice(0, 40)}${slot}${leg}`, amountInRaw: "250000", amountOutRaw, decimals: 8, blockTime: 1791231170, mint, symbol,
  });
}
