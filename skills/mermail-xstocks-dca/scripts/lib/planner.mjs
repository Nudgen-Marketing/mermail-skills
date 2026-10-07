import { fromBaseUnits, parseDuration, parseInstant } from "./core.mjs";
import { verifyChain } from "./ledger.mjs";
import { mandateId, shortId, usdcUnits } from "./mandate.mjs";

const SLOT_KINDS = new Set(["intent", "submitted", "filled", "failed", "uncertain"]);
const COMMITTED = new Set(["intent", "submitted", "filled", "uncertain"]);
const UNRESOLVED = new Set(["intent", "submitted"]);
// An intent younger than this belongs to a tick that may still be between its swap and its
// "submitted" record; only an older one is declared uncertain.
export const INTENT_GRACE_MS = 10 * 60_000;

export const slotAt = (mandate, nowMs) =>
  Math.floor((nowMs - parseInstant(mandate.cadence.anchor)) / parseDuration(mandate.cadence.every));

const noticeKey = (slot, leg, reason) => `${slot}:${leg}:${reason}`;

export function deriveState(mandate, ledger, nowMs) {
  const slots = new Map();
  const notices = new Set();
  let paused = false;
  let revoked = false;
  let lastStatementAtMs = null;
  for (const entry of ledger) {
    if (entry.kind === "paused") paused = true;
    if (entry.kind === "resumed") paused = false;
    if (entry.kind === "revoked") revoked = true;
    if (entry.kind === "statement") lastStatementAtMs = parseInstant(entry.at);
    if (entry.kind === "refused" || entry.kind === "skipped") notices.add(noticeKey(entry.slot, entry.leg, entry.data.reason));
    if (SLOT_KINDS.has(entry.kind)) {
      const key = `${entry.slot}:${entry.leg}`;
      const previous = slots.get(key);
      slots.set(key, {
        slot: entry.slot,
        leg: entry.leg,
        status: entry.kind,
        amountInRaw: entry.data.amountInRaw ?? previous?.amountInRaw ?? "0",
        requestId: entry.data.requestId ?? previous?.requestId ?? null,
        committedAtMs: previous?.committedAtMs ?? parseInstant(entry.at),
      });
    }
  }
  const windowStartMs = nowMs - parseDuration(mandate.caps.window.duration);
  let committedRaw = 0n;
  let windowRaw = 0n;
  let spentRaw = 0n;
  let inflightRaw = 0n;
  for (const slot of slots.values()) {
    if (!COMMITTED.has(slot.status)) continue;
    const amount = BigInt(slot.amountInRaw);
    committedRaw += amount;
    if (slot.status === "filled") spentRaw += amount;
    else inflightRaw += amount;
    if (slot.committedAtMs > windowStartMs) windowRaw += amount;
  }
  const totalRaw = usdcUnits(mandate.caps.totalUsdc);
  const minSliceRaw = mandate.legs.map((leg) => usdcUnits(leg.sliceUsdc)).reduce((a, b) => (b < a ? b : a));
  let status = "active";
  if (revoked) status = "revoked";
  else if (nowMs >= parseInstant(mandate.expiresAt)) status = "expired";
  else if (nowMs < parseInstant(mandate.validFrom)) status = "not_started";
  else if (paused) status = "paused";
  else if (totalRaw - committedRaw < minSliceRaw) status = "exhausted";
  return {
    status, slots, notices, lastStatementAtMs, committedRaw, windowRaw, spentRaw, inflightRaw, totalRaw,
    windowMaxRaw: usdcUnits(mandate.caps.window.maxUsdc),
  };
}

export function budgetOf(state) {
  const usdc = (raw) => fromBaseUnits(raw < 0n ? 0n : raw, 6);
  return {
    spentUsdc: usdc(state.spentRaw),
    inflightUsdc: usdc(state.inflightRaw),
    windowCommittedUsdc: usdc(state.windowRaw),
    windowRemainingUsdc: usdc(state.windowMaxRaw - state.windowRaw),
    totalRemainingUsdc: usdc(state.totalRaw - state.committedRaw),
  };
}

export function intentAllowed(mandate, ledger, nowMs, slot, leg) {
  const state = deriveState(mandate, ledger, nowMs);
  if (state.status !== "active") return state.status;
  if ([...state.slots.values()].some((entry) => UNRESOLVED.has(entry.status))) return "unresolved_order";
  if (slot !== slotAt(mandate, nowMs)) return "slot_not_current";
  if (state.slots.has(`${slot}:${leg}`)) return "slot_done";
  const slice = usdcUnits(mandate.legs[leg].sliceUsdc);
  if (state.committedRaw + slice > state.totalRaw) return "cap_total";
  if (state.windowRaw + slice > state.windowMaxRaw) return "cap_window";
  return null;
}

function refusalFor(leg, check, state, planned, slice, available) {
  if (!check) return "verification_unavailable";
  if (check.mint !== leg.mint) return "mint_mismatch";
  if (check.status !== "verified" || check.identityVerified !== true) return "unverified";
  if (check.halted !== false) return "halted";
  if (state.committedRaw + planned + slice > state.totalRaw) return "cap_total";
  if (state.windowRaw + planned + slice > state.windowMaxRaw) return "cap_window";
  if (available === null) return "balance_unavailable";
  if (planned + slice > available) return "insufficient_funds";
  return null;
}

export function plan({ mandate, ledger, now, observations = {} }) {
  const nowMs = parseInstant(now);
  const id = mandateId(mandate);
  const base = { mandateId: id, shortId: shortId(id), now };
  const integrity = verifyChain(ledger, id);
  if (!integrity.ok) {
    return {
      ...base, status: "integrity_failed", slot: null, records: [], statementDue: false, budget: null,
      actions: [{ type: "halt", reason: `integrity_${integrity.reason}`, seq: integrity.seq }],
    };
  }
  const state = deriveState(mandate, ledger, nowMs);
  const budget = budgetOf(state);
  const actions = [];
  const records = [];
  const notice = (kind, slot, leg, reason, extra = {}) => {
    if (state.notices.has(noticeKey(slot, leg, reason))) return false;
    records.push({ kind, slot, leg, data: { reason, ...extra } });
    return true;
  };

  let inFlight = false;
  for (const entry of state.slots.values()) {
    if (entry.status === "submitted") actions.push({ type: "reconcile", slot: entry.slot, leg: entry.leg, requestId: entry.requestId });
    if (entry.status === "intent" && nowMs - entry.committedAtMs < INTENT_GRACE_MS) inFlight = true;
    else if (entry.status === "intent") {
      records.push({ kind: "uncertain", slot: entry.slot, leg: entry.leg, data: { reason: "intent_without_request", amountInRaw: entry.amountInRaw } });
    }
  }
  if (inFlight && !actions.length && !records.length) {
    return { ...base, status: "in_progress", slot: null, actions, records, statementDue: false, budget };
  }
  if (actions.length || records.length) {
    return { ...base, status: "reconciling", slot: null, actions, records, statementDue: false, budget };
  }

  const statementDue = state.spentRaw > 0n && (state.lastStatementAtMs === null
    || nowMs - state.lastStatementAtMs >= parseDuration(mandate.reports.statementEvery));
  if (state.status !== "active") {
    if (state.status === "expired" || state.status === "exhausted") notice("skipped", null, null, state.status);
    return { ...base, status: state.status, slot: null, actions, records, statementDue, budget };
  }
  const slot = slotAt(mandate, nowMs);
  if (slot < 0) return { ...base, status: "waiting", slot, actions, records, statementDue, budget };

  const available = observations.usdcRaw === undefined || observations.usdcRaw === null ? null : BigInt(observations.usdcRaw);
  let planned = 0n;
  mandate.legs.forEach((leg, index) => {
    if (state.slots.has(`${slot}:${index}`)) return;
    const slice = usdcUnits(leg.sliceUsdc);
    const refusal = refusalFor(leg, observations.verification?.[leg.mint], state, planned, slice, available);
    if (refusal === "insufficient_funds") {
      const shortfallRaw = String(planned + slice - available);
      if (notice("refused", slot, index, refusal, { shortfallRaw })) {
        actions.push({ type: "refill", slot, leg: index, shortfallRaw, shortfallUsdc: fromBaseUnits(shortfallRaw, 6) });
      }
      return;
    }
    if (refusal) {
      notice("refused", slot, index, refusal);
      return;
    }
    planned += slice;
    actions.push({
      type: "buy", slot, leg: index, symbol: leg.symbol, mint: leg.mint, amountRaw: String(slice),
      slippageBps: mandate.guards.maxSlippageBps, slotKey: `${base.shortId}:${slot}:${index}`,
    });
  });
  return { ...base, status: "active", slot, actions, records, statementDue, budget };
}
