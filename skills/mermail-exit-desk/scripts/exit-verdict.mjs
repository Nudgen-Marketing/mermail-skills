#!/usr/bin/env node
// Deterministic exit verdict for one Solana meme-coin position.
//
// Pure rules in `verdict()`; the CLI fetches up to two fixed, keyless, read-only
// sources and prints one JSON object. It never signs, sends, or spends.
//
//   node exit-verdict.mjs --mint <mint> --entry-usd <price> --opened-at <ISO>
//        [--peak-usd <price>] [--took-half] [--ledger-file <path>] [--now <ISO>] [--skip-evidence]
//
// --ledger-file is a text file holding the bodies of the desk's earlier sent
// memos; only exact ledger lines for this mint, entry, and purchase time are used.
// Importing this module performs no network request.
//
// Requires Node.js 22+ (global fetch). No dependencies, no environment variables.

import { open, lstat } from "node:fs/promises";
import { constants } from "node:fs";
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
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

// Decisions and ledger identity use exact declared decimals, not rounded display
// values. Numeric callers retain compatibility through their shortest decimal
// representation; precision already lost in a JSON number cannot be recovered.
function decimalText(value) {
  if (typeof value !== "number") return typeof value === "string" ? value.trim() : "";
  if (!Number.isFinite(value)) return "";
  const raw = String(value);
  if (!/[eE]/.test(raw)) return raw;
  const [mantissa, exponent] = raw.toLowerCase().split("e");
  const [whole, fraction = ""] = mantissa.split(".");
  const digits = whole + fraction, point = whole.length + Number(exponent);
  return point <= 0 ? `0.${"0".repeat(-point)}${digits}`
    : point >= digits.length ? digits + "0".repeat(point - digits.length)
      : digits.slice(0, point) + "." + digits.slice(point);
}

function exactPrice(value, name) {
  const raw = decimalText(value), n = Number(raw);
  if (raw.length > 800 || !DECIMAL.test(raw) || !Number.isFinite(n) || n <= 0) {
    throw new InputError(`${name} must be a bounded positive decimal number in USD`);
  }
  const [whole, fraction = ""] = raw.split(".");
  const tail = fraction.replace(/0+$/, "");
  const text = BigInt(whole).toString() + (tail ? "." + tail : "");
  return { text, n: BigInt(whole + fraction), d: 10n ** BigInt(fraction.length), number: n };
}

const compare = (a, b) => a.n * b.d - b.n * a.d;
const atLeast = (a, b, numerator, denominator = 1n) =>
  a.n * b.d * denominator >= b.n * a.d * numerator;
const atMost = (a, b, numerator, denominator = 1n) =>
  a.n * b.d * denominator <= b.n * a.d * numerator;
const maximum = (...values) => values.reduce((a, b) => compare(a, b) >= 0n ? a : b);
function level(price, numerator, denominator = 1n) {
  // Only factors 2, 1/2 and 7/10 are used, hence a terminating decimal.
  let n = price.n * numerator, d = price.d * denominator;
  const whole = n / d; n %= d;
  let fraction = "";
  while (n) { n *= 10n; fraction += String(n / d); n %= d; }
  const text = String(whole) + (fraction ? "." + fraction : "");
  return Number.isFinite(Number(text)) && Number(text) > 0 ? Number(text) : text;
}

// Accepts a number or a plain decimal string: no hex, no exponent, no Infinity.
export function usd(value, name) {
  return exactPrice(value, name).number;
}

export function isoTime(value, name) {
  const text = value instanceof Date ? (Number.isFinite(value.getTime()) ? value.toISOString() : "") : String(value ?? "").trim();
  const at = new Date(text);
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|([+-])(\d{2}):(\d{2}))$/.exec(text);
  const y = Number(parts?.[1]), m = Number(parts?.[2]), d = Number(parts?.[3]);
  const calendar = new Date(0); calendar.setUTCFullYear(y, m - 1, d); calendar.setUTCHours(0, 0, 0, 0);
  if (!ISO_TIME.test(text) || !parts || Number.isNaN(at.getTime()) ||
      calendar.getUTCFullYear() !== y || calendar.getUTCMonth() + 1 !== m || calendar.getUTCDate() !== d ||
      Number(parts[4]) > 23 || Number(parts[5]) > 59 || Number(parts[6] ?? 0) > 59 ||
      Number(parts[8] ?? 0) > 14 || Number(parts[9] ?? 0) > 59 ||
      (Number(parts[8]) === 14 && Number(parts[9]) !== 0)) {
    throw new InputError(`${name} must be an ISO-8601 time with a zone, such as 2026-09-27T14:05:00Z`);
  }
  return at;
}

const round = (n, digits = 4) => Number(n.toPrecision(digits));

export function isMint(value) {
  return typeof value === "string" && MINT.test(value);
}

// One rule fires, in this order. `hold` when none does.
export function verdict({ entryUsd, priceUsd, peakUsd, liquidityUsd, openedAt, now, tookHalf = false }) {
  if (typeof tookHalf !== "boolean") throw new InputError("tookHalf must be boolean");
  const entryExact = exactPrice(entryUsd, "entryUsd"), priceExact = exactPrice(priceUsd, "priceUsd");
  const entry = entryExact.number, price = priceExact.number;
  const opened = isoTime(openedAt, "openedAt");
  const at = isoTime(now ?? new Date(), "now");
  if (opened > at) throw new Error("openedAt is in the future");
  const peakExact = maximum(peakUsd === undefined || peakUsd === null ? entryExact : exactPrice(peakUsd, "peakUsd"), priceExact, entryExact);
  const peak = peakExact.number;
  const multiple = price / entry;
  if (!Number.isFinite(multiple) || multiple <= 0 || !Number.isFinite(peak / entry)) {
    throw new InputError("the entry and the live price are too far apart to compare");
  }
  const hoursHeld = (at - opened) / 3_600_000;
  const base = {
    multiple: round(multiple),
    peak_multiple: round(peak / entry),
    peak_usd: peak,
    peak_usd_exact: peakExact.text,
    drop_from_peak_pct: Number(((1 - price / peak) * 100).toFixed(2)),
    hours_held: Number(hoursHeld.toFixed(2)),
    time_stop_at: new Date(opened.getTime() + RULES.timeStopHours * 3_600_000).toISOString(),
    levels: {
      take_half_usd: level(entryExact, 2n),
      cut_usd: level(entryExact, 1n, 2n),
      trail_usd: atLeast(peakExact, entryExact, 13n, 10n) ? level(peakExact, 7n, 10n) : null,
    },
  };
  const out = (status, sellFraction, reason) => ({ status, sell_fraction: sellFraction, reason, ...base });

  if (number(liquidityUsd) !== null && number(liquidityUsd) < RULES.rugLiquidityUsd) {
    return out("exit_rug", 1, `pool liquidity $${Math.round(Number(liquidityUsd))} is under $${RULES.rugLiquidityUsd}`);
  }
  if (!tookHalf && atLeast(priceExact, entryExact, 2n)) {
    return out("take_half", 0.5, `price is ${plain(multiple, 3)}x entry, at or above ${RULES.takeHalfMultiple}x`);
  }
  if (atLeast(peakExact, entryExact, 13n, 10n) && atMost(priceExact, peakExact, 7n, 10n)) {
    return out("exit_now", 1, `price is down ${base.drop_from_peak_pct}% from a ${plain(peak / entry, 4)}x peak, past the ${RULES.trailDropPct}% trailing stop`);
  }
  if (atMost(priceExact, entryExact, 1n, 2n)) {
    return out("cut", 1, `price is ${plain(multiple, 3)}x entry, at or under ${RULES.cutMultiple}x`);
  }
  if (hoursHeld >= RULES.timeStopHours) {
    return out("time_stop", 1, `${hoursHeld.toFixed(1)} hours held, past the ${RULES.timeStopHours}-hour stop`);
  }
  return out("hold", 0, "no exit rule fired");
}

const number = (value) => {
  if (typeof value !== "number" && !(typeof value === "string" && value.length <= 800 && DECIMAL.test(value))) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

// The price is the deepest Solana pool that holds this mint as its base token and quotes it
// in SOL, USDC, or USDT. A pool quoted in another token reports a price that is not this token's.
export function bestPair(body, mint) {
  if (!Array.isArray(body?.pairs) || body.pairs.length > 1000) throw new Error("invalid bounded price response");
  const pools = body.pairs
    .filter((p) => p?.chainId === "solana" && p?.baseToken?.address === mint &&
      Object.hasOwn(QUOTE_MINTS, p?.quoteToken?.address ?? ""))
    .flatMap((p) => { try { return [{ ...p, exactPrice: exactPrice(p.priceUsd, "pool price") }]; } catch { return []; } })
    .sort((a, b) => (number(b?.liquidity?.usd) ?? 0) - (number(a?.liquidity?.usd) ?? 0));
  if (pools.length === 0) return null;
  const [p, second] = pools;
  if (second && (number(second?.liquidity?.usd) ?? 0) >= RULES.rugLiquidityUsd) {
    const [low, high] = compare(p.exactPrice, second.exactPrice) <= 0n ? [p.exactPrice, second.exactPrice] : [second.exactPrice, p.exactPrice];
    const gap = Math.abs(p.exactPrice.number - second.exactPrice.number) / Math.min(p.exactPrice.number, second.exactPrice.number);
    if (!atMost(high, low, 11n, 10n)) {
      throw new Error(`the two deepest pools disagree on the price by ${Math.round(gap * 100)}%`);
    }
  }
  return {
    price_usd: p.exactPrice.number,
    price_usd_exact: p.exactPrice.text,
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
  /^EXIT-DESK-LEDGER v1 \| mint=([1-9A-HJ-NP-Za-km-z]{32,44}) \| entry_usd=([0-9.]+) \| opened_at=([0-9TZ:.+-]+) \| peak_usd=([0-9.]+) \| took_half=(true|false) \| observed_at=([0-9TZ:.+-]+) \| price_usd=([0-9.]+)$/;

export function ledgerLine({ mint, entryUsd, openedAt, peakUsd, tookHalf, observedAt, priceUsd }) {
  return (
    `EXIT-DESK-LEDGER v1 | mint=${mint} | entry_usd=${exactPrice(entryUsd, "ledger entry").text} | opened_at=${isoTime(openedAt, "ledger purchase time").toISOString()}` +
    ` | peak_usd=${exactPrice(peakUsd, "ledger peak").text} | took_half=${Boolean(tookHalf)} | observed_at=${isoTime(observedAt, "ledger observation time").toISOString()} | price_usd=${exactPrice(priceUsd, "ledger price").text}`
  );
}

export function parseLedger(text, mint) {
  const rows = [];
  if (text !== undefined && text !== null && (typeof text !== "string" || text.length > 60_000)) throw new InputError("ledger text exceeds the bounded memo scope");
  // Five bounded memo bodies; preserve exact decimal prices without truncation.
  for (const raw of String(text ?? "").split("\n")) {
    if (raw.length > 2800) continue;
    const m = raw.trim().match(LEDGER);
    if (!m || m[1] !== mint) continue;
    try {
      const entry = exactPrice(m[2], "ledger entry"), peak = exactPrice(m[4], "ledger peak"), price = exactPrice(m[7], "ledger price");
      const row = {
        mint: m[1],
        entryUsd: entry.number, entryExact: entry.text,
        openedAt: isoTime(m[3], "ledger purchase time").toISOString(),
        peakUsd: peak.number, peakExact: peak.text,
        tookHalf: m[5] === "true",
        observedAt: isoTime(m[6], "ledger observation time").toISOString(),
        priceUsd: price.number, priceExact: price.text,
      };
      if (new Date(row.observedAt) >= new Date(row.openedAt)) rows.push(row);
    } catch { /* malformed ledger rows are ignored, never normalized into evidence */ }
  }
  return rows;
}

// Ledger rows may raise the peak and carry took_half. They never set or change the entry.
export function mergeLedger(rows, { entryUsd, openedAt, now }) {
  const entry = exactPrice(entryUsd, "entry price"), opened = isoTime(openedAt, "purchase time").getTime();
  const clock = now === undefined ? null : isoTime(now, "evaluation time").getTime();
  const same = rows.filter(
    (r) => { try { return compare(exactPrice(r.entryExact ?? r.entryUsd, "ledger entry"), entry) === 0n &&
      isoTime(r.openedAt, "ledger purchase time").getTime() === opened &&
      (clock === null || isoTime(r.observedAt, "ledger observation time").getTime() <= clock);
    } catch { return false; } },
  );
  const peak = same.reduce((a, r) => maximum(a, exactPrice(r.peakExact ?? r.peakUsd, "ledger peak"), exactPrice(r.priceExact ?? r.priceUsd, "ledger price")), entry);
  return {
    peakUsd: peak.number, peakExact: peak.text,
    tookHalf: same.some((r) => r.tookHalf),
    rowsUsed: same.length,
    rowsIgnored: rows.length - same.length,
  };
}

const MAX_RESPONSE_BYTES = 40_000;
const MAX_RESPONSE_CHARS = 10_000;
async function getJson(url) {
  const target = new URL(url);
  if (![PRICE_ORIGIN, EVIDENCE_ORIGIN].includes(target.origin) || target.username || target.password) throw new Error("source origin not allowed");
  const response = await fetch(target.href, { headers: { accept: "application/json" }, redirect: "error", credentials: "omit", signal: AbortSignal.timeout(15_000) });
  const reject = async (message) => { await response.body?.cancel().catch(() => {}); throw new Error(message); };
  if (!response.ok) return reject(`${target.host} answered HTTP ${response.status}`);
  if (response.redirected || (response.url && new URL(response.url).origin !== target.origin)) return reject("source redirect not allowed");
  if (Number(response.headers.get("content-length")) > MAX_RESPONSE_BYTES || !response.body) return reject("source response exceeds bounds");
  const reader = response.body.getReader(), chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) throw new Error("source response exceeds bounds");
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (text.length > MAX_RESPONSE_CHARS) throw new Error("source response exceeds bounds");
  return JSON.parse(text);
}

export async function check({ mint, entryUsd, openedAt, peakUsd, tookHalf = false, now, ledgerText, includeEvidence = true }) {
  if (!isMint(mint)) throw new InputError("mint must be a Solana address (32-44 base58 characters)");
  if (typeof includeEvidence !== "boolean") throw new InputError("includeEvidence must be boolean");
  if (typeof tookHalf !== "boolean") throw new InputError("tookHalf must be boolean");
  entryUsd = exactPrice(entryUsd, "entry price").text;
  if (peakUsd !== undefined && peakUsd !== null) peakUsd = exactPrice(peakUsd, "recorded peak").text;
  openedAt = isoTime(openedAt, "purchase time").toISOString();
  now = (now === undefined || now === null ? new Date() : isoTime(now, "evaluation time")).toISOString();
  if (new Date(openedAt) > new Date(now)) throw new InputError("purchase time is in the future");

  const memory = mergeLedger(parseLedger(ledgerText, mint), { entryUsd, openedAt, now });
  const recordedPeak = maximum(exactPrice(peakUsd ?? entryUsd, "recorded peak"), exactPrice(memory.peakExact, "ledger peak")).text;
  const halfTaken = tookHalf || memory.tookHalf;

  const pair = bestPair(await getJson(`${PRICE_ORIGIN}/latest/dex/tokens/${mint}`), mint);
  if (!pair) {
    return { status: "evidence_unavailable", reason: "no Solana pool prices this mint in SOL, USDC, or USDT", mint };
  }
  let lens = null;
  try {
    if (includeEvidence) lens = await getJson(`${EVIDENCE_ORIGIN}/lens/${mint}?json=1`);
  } catch {
    lens = null; // the verdict needs a price, not the evidence
  }
  const v = verdict({
    entryUsd, priceUsd: pair.price_usd_exact, peakUsd: recordedPeak, liquidityUsd: pair.liquidity_usd,
    openedAt, now, tookHalf: halfTaken,
  });
  const observedAt = now;
  let context;
  try {
    context = lens === null
      ? { coverage: "unavailable", note: includeEvidence ? "the evidence source did not answer" : "evidence declined by the user; no evidence request made", flags: [], desk_flags: [] }
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
      mint, entryUsd, openedAt, peakUsd: v.peak_usd_exact, tookHalf: halfTaken, observedAt, priceUsd: pair.price_usd_exact,
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
    if (key === "--skip-evidence") { if (out.includeEvidence === false) throw new InputError(`${key} was given twice`); out.includeEvidence = false; }
    else if (key === "--took-half") out.tookHalf = true;
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

async function readLedgerFile(file) {
  let handle;
  try {
    const info = await lstat(file);
    if (!info.isFile() || info.size > 240_000) throw new InputError("ledger file must be a bounded regular file");
    handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
    if (!(await handle.stat()).isFile()) throw new InputError("ledger file must be a regular file");
    // A fixed buffer also bounds a file that grows between stat and read.
    const bytes = new Uint8Array(240_001); let size = 0;
    while (size < bytes.length) {
      const { bytesRead } = await handle.read(bytes, size, bytes.length - size, null);
      if (!bytesRead) break;
      size += bytesRead;
    }
    if (size > 240_000) throw new InputError("ledger file exceeds the bounded memo scope");
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, size));
    if (text.length > 60_000) throw new InputError("ledger file exceeds the bounded memo scope");
    return text;
  } catch (error) {
    if (error instanceof InputError) throw error;
    throw new InputError("the ledger file could not be read as bounded UTF-8 text");
  } finally { await handle?.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const input = args(process.argv.slice(2));
    if (input.ledgerFile) {
      input.ledgerText = await readLedgerFile(input.ledgerFile);
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
