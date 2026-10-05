import { fromBaseUnits } from "./core.mjs";
import { ledgerBlock } from "./ledger.mjs";
import { mandateId, shortId } from "./mandate.mjs";

export const BRAND = "Standing Order";

const REASONS = {
  cap_total: "the total budget of the mandate is used up",
  cap_window: "the rolling spending window is full",
  insufficient_funds: "the Agent Wallet does not hold enough Solana USDC",
  balance_unavailable: "the Agent Wallet balance could not be read",
  verification_unavailable: "the xStocks catalog could not confirm this asset right now",
  mint_mismatch: "the catalog reports a different mint than the one you approved",
  unverified: "the catalog no longer verifies this asset",
  halted: "trading in this asset is halted or its status is unknown",
  expired: "the mandate reached its end date",
  exhausted: "the mandate has no budget left for another slice",
  intent_without_request: "a purchase may have been sent without a recorded request",
};
const PRIORITY = [
  "escalation_ignored", "revoked", "paused", "uncertain", "failed", "refused", "filled", "statement",
  "skipped", "resumed", "genesis", "submitted", "control_seen", "intent",
];
const usdc = (raw) => fromBaseUnits(raw, 6);
const reason = (code) => REASONS[code] ?? code;
const escapeHtml = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const linkify = (html) => html.replace(/https:\/\/solscan\.io\/tx\/[1-9A-HJ-NP-Za-km-z]+/g, (url) => `<a href="${url}">${url}</a>`);

export function describeMandate(mandate) {
  const legs = mandate.legs.map((leg) => `${leg.sliceUsdc} USDC of ${leg.symbol}`).join(" + ");
  return `${legs} every ${mandate.cadence.every}, up to ${mandate.caps.window.maxUsdc} USDC per ${mandate.caps.window.duration} `
    + `and ${mandate.caps.totalUsdc} USDC in total, slippage guard ${mandate.guards.maxSlippageBps} bps, valid until ${mandate.expiresAt}`;
}

function line(entry, mandate) {
  const leg = entry.leg === null ? null : mandate.legs[entry.leg];
  const data = entry.data;
  switch (entry.kind) {
    case "genesis": return `Standing order active: ${describeMandate(mandate)}. Receipts go to ${mandate.owner.email}.`;
    case "submitted": return `Order submitted for ${leg.symbol} (slot ${entry.slot}); waiting for settlement.`;
    case "filled": return `Filled ${leg.symbol}: ${usdc(data.amountInRaw)} USDC -> ${fromBaseUnits(data.amountOutRaw, data.decimals)} ${leg.symbol} raw units (before the xStocks multiplier), tx ${data.tx.slice(0, 6)}...${data.tx.slice(-6)} https://solscan.io/tx/${data.tx}`;
    case "failed": return `Not filled ${leg.symbol} (slot ${entry.slot}): ${data.reason}. Nothing is retried in this slot.`;
    case "uncertain": return `Needs attention ${leg.symbol} (slot ${entry.slot}): ${reason(data.reason)}. The slot is closed and still counted against the budget.`;
    case "refused": return `Refused ${leg ? `${leg.symbol} ` : ""}(slot ${entry.slot}): ${reason(data.reason)}.`;
    case "skipped": return `Desk idle: ${reason(data.reason)}.`;
    case "paused": return "Paused by your reply. No purchases until you resume from your agent session.";
    case "resumed": return "Resumed from your agent session.";
    case "revoked": return data.by === "email" ? "Stopped by your reply. This standing order is permanently revoked." : "Revoked from your agent session.";
    case "escalation_ignored": return `Ignored an email that asked to ${data.keyword}. Email can only pause or stop this desk; changes need your agent session.`;
    case "control_seen": return data.fromOwner && data.action === "none" ? "Your reply was read. Only PAUSE or STOP have an effect." : null;
    case "statement": return `Statement issued: invested ${data.totals.investedUsdc} USDC, mark ${data.totals.valueUsd ?? "n/a"} USD, PnL ${data.totals.pnlUsd ?? "n/a"} USD.`;
    default: return null;
  }
}

function title(top, entries, mandate) {
  const leg = top.leg === null ? null : mandate.legs[top.leg];
  switch (top.kind) {
    case "escalation_ignored": return "Ignored an email that tried to change your mandate";
    case "revoked": return "Standing order revoked";
    case "paused": return "Paused";
    case "uncertain": return `Check ${leg.symbol} order`;
    case "failed": return `Not filled ${leg.symbol}`;
    case "refused": return `Refused ${leg ? `${leg.symbol}: ` : ""}${top.data.reason}`;
    case "filled": return `Filled ${entries.filter((entry) => entry.kind === "filled").map((entry) => mandate.legs[entry.leg].symbol).join(", ")}`;
    case "statement": return `Statement: PnL ${top.data.totals.pnlUsd ?? "n/a"} USD`;
    case "skipped": return `Idle: ${top.data.reason}`;
    case "resumed": return "Resumed";
    case "genesis": return `Mandate active: ${mandate.legs.map((entry) => entry.symbol).join(", ")}`;
    case "submitted": return `Order submitted ${leg.symbol}`;
    case "control_seen": return "Reply received";
    default: return "Order pending";
  }
}

function statementLines(statement) {
  return [
    `Statement as of ${statement.asOf}`,
    ...statement.legs.map((leg) => `${leg.symbol}: ${leg.fills} fills, invested ${leg.investedUsdc} USDC, ${leg.units} shares (multiplier ${leg.multiplier}), `
      + `avg cost ${leg.avgCostUsd ?? "n/a"} USD, mark ${leg.valueUsd ?? "n/a"} USD, PnL ${leg.pnlUsd ?? "n/a"} USD (${leg.pnlPct ?? "n/a"}%)`
      + `${leg.flags.length ? ` [${leg.flags.join(", ")}]` : ""}`),
    `Total: invested ${statement.totals.investedUsdc} USDC, mark ${statement.totals.valueUsd ?? "n/a"} USD, PnL ${statement.totals.pnlUsd ?? "n/a"} USD (${statement.totals.pnlPct ?? "n/a"}%)`,
    "Marks are the Agent Wallet portfolio value of each holding, prorated to what this desk bought. This is an activity record, not a brokerage confirmation or investment advice.",
  ];
}

function statementTable(statement) {
  const cell = (value) => `<td style="padding:4px 8px;border-bottom:1px solid #ddd">${escapeHtml(value ?? "n/a")}</td>`;
  const head = ["Asset", "Fills", "Invested USDC", "Shares", "Avg cost", "Mark USD", "PnL USD", "PnL %"]
    .map((label) => `<th style="text-align:left;padding:4px 8px;border-bottom:2px solid #111">${label}</th>`).join("");
  const rows = statement.legs.map((leg) => `<tr>${[leg.symbol, leg.fills, leg.investedUsdc, leg.units, leg.avgCostUsd, leg.valueUsd, leg.pnlUsd, leg.pnlPct].map(cell).join("")}</tr>`).join("");
  const total = statement.totals;
  return `<table style="border-collapse:collapse;font-size:13px"><tr>${head}</tr>${rows}`
    + `<tr>${["Total", "", total.investedUsdc, "", "", total.valueUsd, total.pnlUsd, total.pnlPct].map(cell).join("")}</tr></table>`;
}

export function renderEmail({ mandate, entries, budget = null }) {
  const tag = `#${shortId(mandateId(mandate))}`;
  const top = [...entries].sort((a, b) => PRIORITY.indexOf(a.kind) - PRIORITY.indexOf(b.kind))[0];
  const lines = entries.map((entry) => line(entry, mandate)).filter(Boolean);
  const statement = entries.findLast((entry) => entry.kind === "statement")?.data ?? null;
  const footer = "Reply PAUSE or STOP to halt this desk. A reply can never resume it, raise a limit or change an asset; only your agent session can.";
  const budgetLine = budget
    ? `Budget: spent ${budget.spentUsdc} USDC, in flight ${budget.inflightUsdc} USDC, window left ${budget.windowRemainingUsdc} USDC, total left ${budget.totalRemainingUsdc} USDC.`
    : null;
  const blocks = entries.map(ledgerBlock);
  const text = [
    `${BRAND} ${tag}`, "", ...lines.map((entry) => `- ${entry}`),
    ...(statement ? ["", ...statementLines(statement)] : []),
    ...(budgetLine ? ["", budgetLine] : []),
    "", footer, "", "Ledger records (machine-readable, used for recovery):", ...blocks,
  ].join("\n");
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;max-width:680px">`
    + `<p style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#555">${BRAND} ${tag}</p>`
    + `<ul>${lines.map((entry) => `<li>${linkify(escapeHtml(entry))}</li>`).join("")}</ul>`
    + (statement ? `${statementTable(statement)}<p style="color:#555">${escapeHtml(statementLines(statement).at(-1))}</p>` : "")
    + (budgetLine ? `<p>${escapeHtml(budgetLine)}</p>` : "")
    + `<p style="color:#555">${escapeHtml(footer)}</p>`
    + `<pre style="font-size:11px;white-space:pre-wrap;word-break:break-all;color:#777">${escapeHtml(blocks.join("\n"))}</pre></div>`;
  return {
    subject: `[${BRAND}] ${title(top, entries, mandate)} ${tag}`,
    text,
    html,
    idempotencyKey: `standing-order-${tag.slice(1)}-${entries[0].seq}-${entries.at(-1).seq}`,
  };
}
