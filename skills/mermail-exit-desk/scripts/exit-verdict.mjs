#!/usr/bin/env node
// Deterministic exit verdict for one Solana meme-coin position.
//
// Pure rules in `verdict()`; the CLI fetches two fixed, keyless, read-only
// sources and prints one JSON object. It never signs, sends, or spends.
//
//   node exit-verdict.mjs --mint <mint> --entry-usd <price> --opened-at <ISO>
//        [--peak-usd <price>] [--took-half] [--ledger-file <path>] [--now <ISO>]
//
// --ledger-file is a text file holding the bodies of the desk's earlier sent
// memos; only exact ledger lines for this mint, entry, and purchase time are used.
// Importing this module performs no network request.
//
// Requires Node.js 22+ (global fetch). No dependencies, no environment variables.

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export const EVIDENCE_ORIGIN = "https://quantbase.live";
export const PRICE_ORIGIN = "https://api.dexscreener.com";

export const RULES = Object.freeze({
  takeHalfMultiple: 2.0, // sell half at 2x entry: the stake is back
  trailArmMultiple: 1.3, // the trailing stop arms once the peak is 30% above entry
  trailDropPct: 30, // then a 30% fall from the peak sells the rest
  cutMultiple: 0.5, // never took off: cut at -50%
  timeStopHours: 6, // most graduates have faded by 6 hours
  rugLiquidityUsd: 1000, // a pool under $1k is not a price anyone sells at
});

// The launch record counts as observed unless the pool is this much older than it.
export const COVERAGE_TOLERANCE_MS = 60_000;

// A price is only read from a pool that quotes the token in one of these.
export const QUOTE_MINTS = Object.freeze({
  So11111111111111111111111111111111111111112: "SOL",
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: "USDC",
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: "USDT",
});
// The two deepest pools must agree this closely, or there is no price.
export const POOL_AGREEMENT_PCT = 10;
// The launch tape behind the evidence began here; base rates cannot describe anything earlier.
export const TAPE_START = "2026-09-20T00:00:00.000Z";

export const FLAG_RULES = Object.freeze({
  serialLaunches: 20, serialGraduatedPct: 5, rugGraduations: 1, nameCollisions: 10,
});

export class InputError extends Error {}

// Plain decimals for people and for the ledger: 9e-7 prints as 0.0000009.
export function plain(value, digits = 6) {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return n.toLocaleString("en-US", { useGrouping: false, maximumSignificantDigits: digits });
}

const MINT = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const DECIMAL = /^\d+(\.\d+)?$/;
// A time without a zone would be read in the machine's own zone, so one is required.
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

// Accepts a number or a plain decimal string: no hex, no exponent, no Infinity.
export function usd(value, name) {
  const text = typeof value === "number" ? plain(value, 15) : String(value ?? "").trim();
  const n = Number(text);
  if (!DECIMAL.test(text) || !Number.isFinite(n) || n <= 0) {
    throw new InputError(`${name} must be a positive decimal number in USD`);
  }
  return n;
}

export function isoTime(value, name) {
  const text = value instanceof Date ? value.toISOString() : String(value ?? "").trim();
  const at = new Date(text);
  if (!ISO_TIME.test(text) || Number.isNaN(at.getTime())) {
    throw new InputError(`${name} must be an ISO-8601 time with a zone, such as 2026-09-27T14:05:00Z`);
  }
  return at;
}

const round = (n, digits = 4) => Number(n.toPrecision(digits));

export function isMint(value) {
  return typeof value === "string" && MINT.test(value);
}

function positive(value, name) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${name} must be a positive number`);
  return n;
}

// One rule fires, in this order. `hold` when none does.
export function verdict({ entryUsd, priceUsd, peakUsd, liquidityUsd, openedAt, now, tookHalf = false }) {
  const entry = positive(entryUsd, "entryUsd");
  const price = positive(priceUsd, "priceUsd");
  const opened = new Date(openedAt);
  const at = new Date(now ?? Date.now());
  if (Number.isNaN(opened.getTime())) throw new Error("openedAt must be an ISO-8601 time");
  if (opened > at) throw new Error("openedAt is in the future");
  const peak = Math.max(Number(peakUsd) > 0 ? Number(peakUsd) : entry, price, entry);
  const multiple = price / entry;
  if (!Number.isFinite(multiple) || multiple <= 0 || !Number.isFinite(peak / entry)) {
    throw new InputError("the entry and the live price are too far apart to compare");
  }
  const hoursHeld = (at - opened) / 3_600_000;
  const base = {
    multiple: round(multiple),
    peak_multiple: round(peak / entry),
    peak_usd: peak,
    drop_from_peak_pct: Number(((1 - price / peak) * 100).toFixed(2)),
    hours_held: Number(hoursHeld.toFixed(2)),
    time_stop_at: new Date(opened.getTime() + RULES.timeStopHours * 3_600_000).toISOString(),
    levels: {
      take_half_usd: entry * RULES.takeHalfMultiple,
      cut_usd: entry * RULES.cutMultiple,
      trail_usd: peak >= entry * RULES.trailArmMultiple ? peak * (1 - RULES.trailDropPct / 100) : null,
    },
  };
  const out = (status, sellFraction, reason) => ({ status, sell_fraction: sellFraction, reason, ...base });

  if (liquidityUsd !== null && liquidityUsd !== undefined && Number(liquidityUsd) < RULES.rugLiquidityUsd) {
    return out("exit_rug", 1, `pool liquidity $${Math.round(Number(liquidityUsd))} is under $${RULES.rugLiquidityUsd}`);
  }
  if (!tookHalf && multiple >= RULES.takeHalfMultiple) {
    return out("take_half", 0.5, `price is ${plain(multiple, 3)}x entry, at or above ${RULES.takeHalfMultiple}x`);
  }
  if (peak >= entry * RULES.trailArmMultiple && price <= peak * (1 - RULES.trailDropPct / 100)) {
    return out("exit_now", 1, `price is down ${base.drop_from_peak_pct}% from a ${plain(peak / entry, 4)}x peak, past the ${RULES.trailDropPct}% trailing stop`);
  }
  if (multiple <= RULES.cutMultiple) {
    return out("cut", 1, `price is ${plain(multiple, 3)}x entry, at or under ${RULES.cutMultiple}x`);
  }
  if (hoursHeld >= RULES.timeStopHours) {
    return out("time_stop", 1, `${hoursHeld.toFixed(1)} hours held, past the ${RULES.timeStopHours}-hour stop`);
  }
  return out("hold", 0, "no exit rule fired");
}

const number = (value) => (value === null || value === undefined || !Number.isFinite(Number(value)) ? null : Number(value));

// The price is the deepest Solana pool that holds this mint as its base token and quotes it
// in SOL, USDC, or USDT. A pool quoted in another token reports a price that is not this token's.
export function bestPair(body, mint) {
  const pools = (body?.pairs ?? [])
    .filter((p) => p?.chainId === "solana" && p?.baseToken?.address === mint &&
      Object.hasOwn(QUOTE_MINTS, p?.quoteToken?.address ?? "") && Number(p?.priceUsd) > 0)
    .sort((a, b) => (number(b?.liquidity?.usd) ?? 0) - (number(a?.liquidity?.usd) ?? 0));
  if (pools.length === 0) return null;
  const [p, second] = pools;
  if (second && (number(second?.liquidity?.usd) ?? 0) >= RULES.rugLiquidityUsd) {
    const gap = Math.abs(Number(p.priceUsd) - Number(second.priceUsd)) / Math.min(Number(p.priceUsd), Number(second.priceUsd));
    if (gap * 100 > POOL_AGREEMENT_PCT) {
      throw new Error(`the two deepest pools disagree on the price by ${Math.round(gap * 100)}%`);
    }
  }
  return {
    price_usd: Number(p.priceUsd),
    liquidity_usd: number(p?.liquidity?.usd),
    fdv_usd: number(p?.fdv),
    dex: p.dexId ?? null,
    pair: p.pairAddress ?? null,
    quote: QUOTE_MINTS[p.quoteToken.address],
    pools_considered: pools.length,
    pair_created_at: p.pairCreatedAt ? new Date(p.pairCreatedAt).toISOString() : null,
    symbol: p?.baseToken?.symbol ?? null,
  };
}

// Evidence is context for the memo. It never changes the verdict and never authorizes a trade.
export function evidence(lens, pair) {
  if (!lens || lens.known !== true) return { coverage: "none", note: "the token is not on the launch tape", flags: [] };
  const created = lens?.token?.created_at ? new Date(lens.token.created_at) : null;
  const pairCreated = pair?.pair_created_at ? new Date(pair.pair_created_at) : null;
  // A pool clearly older than the tape's first sight of the token means the launch was not observed.
  // Without both times the launch cannot be shown to have been observed, so it is treated as unobserved.
  const observed = Boolean(created && pairCreated && !Number.isNaN(created.getTime()) &&
    pairCreated.getTime() >= created.getTime() - COVERAGE_TOLERANCE_MS);
  const asOf = lens.as_of ? new Date(lens.as_of) : null;
  const hours = Number(lens?.base_rates?.since_hours);
  const windowFrom = asOf && !Number.isNaN(asOf.getTime()) && hours > 0
    ? new Date(Math.max(asOf.getTime() - hours * 3_600_000, new Date(TAPE_START).getTime())).toISOString()
    : null;
  const common = { as_of: lens.as_of ?? null, base_rates: lens.base_rates ?? null, base_rates_from: windowFrom };
  if (!observed) {
    // Everything derived from the launch is dropped, including the source's own flags and summary.
    return {
      coverage: "partial",
      note: "the launch was not observed: graduation, creator history, metadata, and flags are not used",
      ...common, graduation: null, creator: null, name_collisions_7d: null, has_socials: null, summary: null,
      flags: [], desk_flags: [],
    };
  }
  const cluster = lens?.creator?.cluster ?? null;
  const meta = lens?.metadata ?? null;
  const instant = Boolean(lens?.token?.graduated_at && lens.token.instant_graduation);
  const hasSocials = meta ? Boolean(meta.has_twitter || meta.has_telegram || meta.has_website) : null;
  const launches = number(cluster?.launches);
  const graduatedPct = launches ? ((number(cluster?.graduations) ?? 0) / launches) * 100 : null;
  const deskFlags = [
    instant && "creator-bought curve",
    launches >= FLAG_RULES.serialLaunches && graduatedPct < FLAG_RULES.serialGraduatedPct && "serial launcher",
    number(cluster?.rug_graduations) >= FLAG_RULES.rugGraduations && "rug history",
    number(meta?.name_collisions_7d) >= FLAG_RULES.nameCollisions && "copycat name",
    hasSocials === false && "no socials",
  ].filter(Boolean);
  return {
    coverage: "full",
    note: null,
    ...common,
    graduation: lens?.token?.graduated_at ? (lens.token.instant_graduation ? "instant" : "organic") : "not_graduated",
    creator: {
      prior_launches: lens?.creator?.prior_launches ?? null,
      prior_graduations: lens?.creator?.prior_graduations ?? null,
      cluster_launches: cluster?.launches ?? null,
      cluster_graduations: cluster?.graduations ?? null,
      cluster_rug_graduations: cluster?.rug_graduations ?? null,
    },
    name_collisions_7d: meta?.name_collisions_7d ?? null,
    // Unknown is not "none": absent metadata must not raise the no-socials flag.
    has_socials: hasSocials,
    desk_flags: deskFlags,
    // The source's own words, kept as quoted data for the reader; the memo prints desk_flags.
    summary: lens.summary ? String(lens.summary).slice(0, 200) : null,
    flags: (Array.isArray(lens.flags) ? lens.flags : []).filter((f) => f && typeof f === "object")
      .map((f) => ({ level: String(f.level ?? "").slice(0, 20), text: String(f.text ?? "").slice(0, 200) })),
  };
}

// The ledger line is the desk's only memory. Strict format; anything else is ignored.
const LEDGER =
  /^EXIT-DESK-LEDGER v1 \| mint=([1-9A-HJ-NP-Za-km-z]{32,44}) \| entry_usd=([0-9.eE+-]+) \| opened_at=([0-9TZ:.+-]+) \| peak_usd=([0-9.eE+-]+) \| took_half=(true|false) \| observed_at=([0-9TZ:.+-]+) \| price_usd=([0-9.eE+-]+)$/;

export function ledgerLine({ mint, entryUsd, openedAt, peakUsd, tookHalf, observedAt, priceUsd }) {
  return (
    `EXIT-DESK-LEDGER v1 | mint=${mint} | entry_usd=${plain(entryUsd, 12)} | opened_at=${new Date(openedAt).toISOString()}` +
    ` | peak_usd=${plain(peakUsd, 12)} | took_half=${Boolean(tookHalf)} | observed_at=${new Date(observedAt).toISOString()} | price_usd=${plain(priceUsd, 12)}`
  );
}

export function parseLedger(text, mint) {
  const rows = [];
  // Five memos of 10,000 characters each; a ledger line is far shorter than 400.
  for (const raw of String(text ?? "").slice(0, 60_000).split("\n")) {
    if (raw.length > 400) continue;
    const m = raw.trim().match(LEDGER);
    if (!m || m[1] !== mint) continue;
    const row = {
      mint: m[1],
      entryUsd: Number(m[2]),
      openedAt: m[3],
      peakUsd: Number(m[4]),
      tookHalf: m[5] === "true",
      observedAt: m[6],
      priceUsd: Number(m[7]),
    };
    if ([row.entryUsd, row.peakUsd, row.priceUsd].every((n) => Number.isFinite(n) && n > 0)) rows.push(row);
  }
  return rows;
}

// Ledger rows may raise the peak and carry took_half. They never set or change the entry.
export function mergeLedger(rows, { entryUsd, openedAt }) {
  const same = rows.filter(
    (r) => Math.abs(r.entryUsd - Number(entryUsd)) <= Number(entryUsd) * 1e-9 &&
      new Date(r.openedAt).getTime() === new Date(openedAt).getTime(),
  );
  return {
    peakUsd: same.reduce((a, r) => Math.max(a, r.peakUsd, r.priceUsd), Number(entryUsd)),
    tookHalf: same.some((r) => r.tookHalf),
    rowsUsed: same.length,
    rowsIgnored: rows.length - same.length,
  };
}

async function getJson(url) {
  const response = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`${new URL(url).host} answered HTTP ${response.status}`);
  return response.json();
}

export async function check({ mint, entryUsd, openedAt, peakUsd, tookHalf = false, now, ledgerText }) {
  if (!isMint(mint)) throw new InputError("mint must be a Solana address (32-44 base58 characters)");
  entryUsd = usd(entryUsd, "entry price");
  if (peakUsd !== undefined && peakUsd !== null) peakUsd = usd(peakUsd, "recorded peak");
  openedAt = isoTime(openedAt, "purchase time").toISOString();
  now = (now === undefined || now === null ? new Date() : isoTime(now, "evaluation time")).toISOString();
  if (new Date(openedAt) > new Date(now)) throw new InputError("purchase time is in the future");

  const memory = mergeLedger(parseLedger(ledgerText, mint), { entryUsd, openedAt });
  const recordedPeak = Math.max(peakUsd ?? 0, memory.peakUsd);
  const halfTaken = Boolean(tookHalf) || memory.tookHalf;

  const pair = bestPair(await getJson(`${PRICE_ORIGIN}/latest/dex/tokens/${mint}`), mint);
  if (!pair) {
    return { status: "evidence_unavailable", reason: "no Solana pool prices this mint in SOL, USDC, or USDT", mint };
  }
  let lens = null;
  try {
    lens = await getJson(`${EVIDENCE_ORIGIN}/lens/${mint}?json=1`);
  } catch {
    lens = null; // the verdict needs a price, not the evidence
  }
  const v = verdict({
    entryUsd, priceUsd: pair.price_usd, peakUsd: recordedPeak, liquidityUsd: pair.liquidity_usd,
    openedAt, now, tookHalf: halfTaken,
  });
  const observedAt = now;
  let context;
  try {
    context = lens === null
      ? { coverage: "unavailable", note: "the evidence source did not answer", flags: [], desk_flags: [] }
      : evidence(lens, pair);
  } catch {
    context = { coverage: "unavailable", note: "the evidence response could not be read", flags: [], desk_flags: [] };
  }
  const symbol = String(pair.symbol ?? "").replace(/[^A-Za-z0-9$_.-]/g, "").slice(0, 12) || "TOKEN";
  return {
    mint,
    symbol: pair.symbol,
    observed_at: observedAt,
    ...v,
    took_half: halfTaken,
    price: pair,
    memory: { rows_used: memory.rowsUsed, rows_ignored: memory.rowsIgnored },
    evidence: context,
    display: {
      symbol,
      subject: `[Exit Desk] ${mint} ${symbol} ${v.status}`,
      entry_usd: plain(entryUsd),
      price_usd: plain(pair.price_usd),
      peak_usd: plain(v.peak_usd),
      multiple: `${plain(v.multiple, 3)}x`,
      peak_multiple: `${plain(v.peak_multiple, 3)}x`,
      take_half_usd: plain(v.levels.take_half_usd),
      trail_usd: v.levels.trail_usd === null ? `not armed until ${RULES.trailArmMultiple}x` : plain(v.levels.trail_usd),
      cut_usd: plain(v.levels.cut_usd),
      liquidity_usd: pair.liquidity_usd === null ? "unknown" : Math.round(pair.liquidity_usd).toLocaleString("en-US"),
      fdv_usd: pair.fdv_usd === null ? "unknown" : Math.round(pair.fdv_usd).toLocaleString("en-US"),
    },
    // took_half records a sale the user reported as done. A take_half verdict alone never sets it.
    ledger: ledgerLine({
      mint, entryUsd, openedAt, peakUsd: v.peak_usd, tookHalf: halfTaken, observedAt, priceUsd: pair.price_usd,
    }),
    rules: RULES,
  };
}

export function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const name = { "--mint": "mint", "--entry-usd": "entryUsd", "--opened-at": "openedAt", "--peak-usd": "peakUsd", "--ledger-file": "ledgerFile", "--now": "now" }[key];
    if (name && (argv[i + 1] === undefined || argv[i + 1].startsWith("--"))) throw new InputError(`${key} needs a value`);
    if ((name && out[name] !== undefined) || (key === "--took-half" && out.tookHalf)) throw new InputError(`${key} was given twice`);
    if (key === "--took-half") out.tookHalf = true;
    else if (key === "--mint") out.mint = argv[++i];
    else if (key === "--entry-usd") out.entryUsd = argv[++i];
    else if (key === "--opened-at") out.openedAt = argv[++i];
    else if (key === "--peak-usd") out.peakUsd = argv[++i];
    else if (key === "--ledger-file") out.ledgerFile = argv[++i];
    else if (key === "--now") out.now = argv[++i];
    else throw new InputError(`unknown argument ${key}`);
  }
  for (const required of ["mint", "entryUsd", "openedAt"]) {
    if (out[required] === undefined) {
      throw new InputError("the mint, the entry price (--entry-usd), and the purchase time (--opened-at) are all required");
    }
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const input = args(process.argv.slice(2));
    if (input.ledgerFile) {
      input.ledgerText = await readFile(input.ledgerFile, "utf8").catch((error) => {
        throw new InputError(`the ledger file could not be read (${error.code ?? "error"})`);
      });
    }
    const result = await check(input);
    console.log(JSON.stringify(result, null, 2));
    if (result.status === "evidence_unavailable") process.exitCode = 1;
  } catch (error) {
    // A bad or missing position value is the user's to supply; anything else is a source failure.
    const status = error instanceof InputError ? "entry_required" : "evidence_unavailable";
    console.log(JSON.stringify({ status, reason: error.message }));
    process.exitCode = 1;
  }
}
