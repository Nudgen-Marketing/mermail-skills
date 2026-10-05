import { divScaled, formatScaled, mulScaled, parseInstant, rawToScaled, toScaled } from "./core.mjs";
import { USDC_DECIMALS, USDC_MINT, mandateId } from "./mandate.mjs";
import { budgetOf, deriveState } from "./planner.mjs";

// xStocks are Token-2022 mints with a scaled UI amount (corporate actions). Raw balances
// must be multiplied by the multiplier in force at `now` to get share-equivalents.
export function effectiveMultiplier(scaled, now) {
  if (!scaled?.currentMultiplier) return "1";
  if (scaled.newMultiplier && scaled.newMultiplierEffectiveAt
    && parseInstant(scaled.newMultiplierEffectiveAt) <= parseInstant(now)) {
    return scaled.newMultiplier;
  }
  return scaled.currentMultiplier;
}

// paybox_get_portfolio output is passed through verbatim, so the model never retypes a balance.
const SOLANA_NETWORK_ID = 1399811149;

function portfolioRow(portfolio, wallet, token) {
  return (portfolio?.items ?? []).find((item) => item.networkId === SOLANA_NETWORK_ID && item.tokenAddress === token
    && (item.wallet_address === undefined || item.wallet_address === wallet)) ?? null;
}

export const usdcFromPortfolio = (portfolio, wallet) => String(portfolioRow(portfolio, wallet, USDC_MINT)?.balance ?? "0");

export function marksFromPortfolio(portfolio, wallet, mints) {
  return Object.fromEntries(mints.map((mint) => {
    const row = portfolioRow(portfolio, wallet, mint);
    return [mint, { holdingRaw: String(row?.balance ?? "0"), valueUsd: String(row?.balanceUsd ?? "0") }];
  }));
}

const balanceRow = (rows, owner, mint) => (rows ?? []).find((row) => row.owner === owner && row.mint === mint) ?? null;

// A fill is only real when the confirmed transaction shows the wallet's USDC going down and
// the pinned mint going up. Provider "success" alone is not settlement evidence.
export function fillFromTransaction(tx, { owner, mint }) {
  if (!tx) return { ok: false, reason: "tx_not_found" };
  if (tx.meta?.err) return { ok: false, reason: "tx_failed" };
  const delta = (target) => {
    const pre = balanceRow(tx.meta?.preTokenBalances, owner, target);
    const post = balanceRow(tx.meta?.postTokenBalances, owner, target);
    return {
      raw: BigInt(post?.uiTokenAmount?.amount ?? "0") - BigInt(pre?.uiTokenAmount?.amount ?? "0"),
      decimals: (post ?? pre)?.uiTokenAmount?.decimals ?? null,
    };
  };
  const usdc = delta(USDC_MINT);
  const asset = delta(mint);
  if (usdc.raw >= 0n) return { ok: false, reason: "no_usdc_spent" };
  if (asset.raw <= 0n) return { ok: false, reason: "no_asset_received" };
  return {
    ok: true,
    signature: tx.transaction?.signatures?.[0] ?? null,
    slot: tx.slot ?? null,
    blockTime: tx.blockTime ?? null,
    amountInRaw: String(-usdc.raw),
    amountOutRaw: String(asset.raw),
    decimals: asset.decimals,
  };
}

function legRow(leg, index, ledger, marks, now) {
  const fills = ledger.filter((entry) => entry.kind === "filled" && entry.leg === index);
  const investedRaw = fills.reduce((sum, entry) => sum + BigInt(entry.data.amountInRaw), 0n);
  const acquiredRaw = fills.reduce((sum, entry) => sum + BigInt(entry.data.amountOutRaw), 0n);
  const decimals = fills[0]?.data.decimals ?? 8;
  const mark = marks[leg.mint];
  const multiplier = effectiveMultiplier(mark?.scaledUiAmount, now);
  const units = mulScaled(rawToScaled(acquiredRaw, decimals), toScaled(multiplier));
  const invested = rawToScaled(investedRaw, USDC_DECIMALS);
  const flags = [];
  let value = null;
  if (fills.length === 0) {
    value = 0n;
  } else if (!mark || mark.holdingRaw === undefined || mark.valueUsd === undefined || mark.valueUsd === null) {
    flags.push("mark_unavailable");
  } else {
    const holding = BigInt(mark.holdingRaw);
    if (acquiredRaw > holding) flags.push("holding_below_acquired");
    const portion = acquiredRaw > holding ? holding : acquiredRaw;
    value = holding === 0n ? 0n : (toScaled(mark.valueUsd) * portion) / holding;
  }
  const pnl = value === null ? null : value - invested;
  const row = {
    symbol: leg.symbol,
    mint: leg.mint,
    fills: fills.length,
    investedUsdc: formatScaled(invested, 6),
    acquiredRaw: String(acquiredRaw),
    units: formatScaled(units, 8),
    multiplier,
    avgCostUsd: units === 0n ? null : formatScaled(divScaled(invested, units), 4),
    valueUsd: value === null ? null : formatScaled(value, 6),
    pnlUsd: pnl === null ? null : formatScaled(pnl, 6),
    pnlPct: pnl === null || invested === 0n ? null : formatScaled(divScaled(pnl * 100n, invested), 2),
    flags,
  };
  return { row, value, invested };
}

export function buildStatement({ mandate, ledger, now, marks = {} }) {
  const rows = mandate.legs.map((leg, index) => legRow(leg, index, ledger, marks, now));
  const invested = rows.reduce((sum, row) => sum + row.invested, 0n);
  const value = rows.every((row) => row.value !== null) ? rows.reduce((sum, row) => sum + row.value, 0n) : null;
  const pnl = value === null ? null : value - invested;
  return {
    asOf: now,
    mandateId: mandateId(mandate),
    legs: rows.map((row) => row.row),
    totals: {
      investedUsdc: formatScaled(invested, 6),
      valueUsd: value === null ? null : formatScaled(value, 6),
      pnlUsd: pnl === null ? null : formatScaled(pnl, 6),
      pnlPct: pnl === null || invested === 0n ? null : formatScaled(divScaled(pnl * 100n, invested), 2),
    },
    budget: budgetOf(deriveState(mandate, ledger, parseInstant(now))),
  };
}
