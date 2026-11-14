#!/usr/bin/env node
// Deterministic pricing, license IDs, and split math for mermail-licensing-desk.
// No network, no dependencies, no wallet access. Prices come only from the owner's rate card.
//
//   node quote.mjs --rate-card rate-card.json --request request.json
//   node quote.mjs --confirm --quote quote.json --paid 1800 --currency USDC --payment-ref "owner ref"
//   node quote.mjs --splits split-sheet.json --amount 1800
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import process from "node:process";
import { pathToFileURL } from "node:url";

export class QuoteError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .filter((key) => value[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

const TERM_FIELDS = ["item", "use", "media", "territory", "term", "exclusivity", "audience"];

function decimal(value, decimals, label, allowZero = false) {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18 ||
      typeof value !== "string" || !/^(0|[1-9]\d{0,63})(?:\.\d+)?$/.test(value)) {
    throw new QuoteError("bad_amount", `${label}: use a bounded plain decimal string`);
  }
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > decimals) throw new QuoteError("bad_amount", `${label}: excess precision`);
  const units = BigInt(whole + fraction.padEnd(decimals, "0"));
  if (!allowZero && units === 0n) throw new QuoteError("bad_amount", `${label}: must be positive`);
  return units;
}

function rateUnits(value, decimals, label, allowZero = false) {
  // JSON.parse may already have rounded a Number's source decimal. Requiring
  // strings prevents us from presenting that altered amount as the owner's rate.
  if (typeof value !== "string") throw new QuoteError("bad_rate_card", `${label}: exact decimal string required; migrate numeric rate-card values from the original owner record`);
  const units = decimal(value, decimals, label, allowZero);
  if (units > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new QuoteError("bad_rate_card", `${label}: exceeds safe rate-card precision`);
  }
  return units;
}

const currencyCode = value => typeof value === "string" && /^[A-Z][A-Z0-9]{2,11}$/.test(value);
const termText = value => typeof value === "string" && value.trim().length > 0 && value.length <= 256 && !/[\u0000-\u001f\u007f]/.test(value);

function lookup(table, key, label) {
  if (!table || !(key in table)) {
    throw new QuoteError("needs_owner", `rate card has no ${label} rate for "${key}"`);
  }
  const factor = table[key];
  if (factor === null) {
    throw new QuoteError("needs_owner", `rate card marks ${label} "${key}" unavailable`);
  }
  return factor;
}

function audienceFactor(tiers, audience) {
  if (!Number.isSafeInteger(audience) || audience < 0) {
    throw new QuoteError("needs_clarification", "audience must be a non-negative integer");
  }
  if (!Array.isArray(tiers) || tiers.length === 0) return "1";
  for (const tier of tiers) {
    if (tier.max === null || audience <= tier.max) return tier.factor;
  }
  throw new QuoteError("needs_owner", `audience ${audience} exceeds every rate card tier`);
}

export function formatCents(cents) {
  if (typeof cents === "number" && !Number.isSafeInteger(cents)) throw new QuoteError("bad_amount", "unsafe cents");
  const units = BigInt(cents);
  const sign = units < 0n ? "-" : "";
  const abs = units < 0n ? -units : units;
  return `${sign}${abs / 100n}.${String(abs % 100n).padStart(2, "0")}`;
}

export function computeQuote(rateCard, request) {
  if (!rateCard || !request || !currencyCode(rateCard.currency) ||
      !termText(rateCard.owner) || !termText(rateCard.version)) {
    throw new QuoteError("bad_rate_card", "owner, currency and version are required");
  }
  const missing = TERM_FIELDS.filter((field) => request[field] === undefined || request[field] === "");
  if (missing.length) {
    throw new QuoteError("needs_clarification", `inquiry is missing: ${missing.join(", ")}`);
  }
  if (TERM_FIELDS.filter(field => field !== "audience").some(field => !termText(request[field])) ||
      !Number.isSafeInteger(request.audience) || request.audience < 0 ||
      (request.deadline_days !== undefined && (!Number.isSafeInteger(request.deadline_days) || request.deadline_days < 0))) {
    throw new QuoteError("needs_clarification", "invalid or conflicting inquiry terms");
  }
  const item = rateCard.items?.[request.item];
  if (!item) throw new QuoteError("needs_owner", `item "${request.item}" is not on the rate card`);
  if (!item.uses?.includes(request.use)) {
    throw new QuoteError("needs_owner", `item "${request.item}" is not offered for use "${request.use}"`);
  }
  if (request.exclusivity === "exclusive" && item.exclusive_available !== true) {
    throw new QuoteError("needs_owner", `item "${request.item}" is not available exclusively`);
  }
  // A rate the owner has not set (e.g. "OWNER_SETS") is never priced by the agent.
  if (item.base === undefined || item.base === null || item.base === "OWNER_SETS") {
    throw new QuoteError("needs_owner", `owner has not set a base rate for "${request.item}"`);
  }
  if (item.floor === null || item.floor === "OWNER_SETS") {
    throw new QuoteError("needs_owner", `owner has not set a floor for "${request.item}"`);
  }
  if (!termText(item.title)) throw new QuoteError("bad_rate_card", "item title is required");
  const m = rateCard.multipliers ?? {};
  const breakdown = [["base", "1"]];
  breakdown.push([`media:${request.media}`, lookup(m.media, request.media, "media")]);
  breakdown.push([`territory:${request.territory}`, lookup(m.territory, request.territory, "territory")]);
  breakdown.push([`term:${request.term}`, lookup(m.term, request.term, "term")]);
  breakdown.push([`exclusivity:${request.exclusivity}`, lookup(m.exclusivity, request.exclusivity, "exclusivity")]);
  breakdown.push([`audience:${request.audience}`, audienceFactor(m.audience, request.audience)]);
  const rush = rateCard.rush;
  if (rush && Number.isInteger(request.deadline_days) && request.deadline_days < rush.days_under) {
    breakdown.push([`rush:<${rush.days_under}d`, rush.factor]);
  }
  const baseCents = rateUnits(item.base, 2, "base");
  let cents = baseCents;
  for (const [label, factor] of breakdown) {
    if (typeof factor !== "string") throw new QuoteError("bad_rate_card", `${label}: exact decimal string multiplier required; numeric factors must be migrated from the original owner record`);
    const scaled = decimal(factor, 18, label);
    const scale = 10n ** 18n;
    cents = (cents * scaled + scale / 2n) / scale;
    if (cents > BigInt(Number.MAX_SAFE_INTEGER)) throw new QuoteError("bad_rate_card", "quote exceeds safe cent range");
  }
  const floorCents = rateUnits(item.floor ?? "0", 2, "floor", true);
  let floorApplied = false;
  if (cents < floorCents) {
    cents = floorCents;
    floorApplied = true;
  }
  const terms = {
    owner: rateCard.owner,
    currency: rateCard.currency,
    price: formatCents(cents),
    title: item.title,
    ...Object.fromEntries(TERM_FIELDS.map((field) => [field, request[field]])),
    rate_card_version: rateCard.version,
  };
  const termsHash = sha256(canonical(terms));
  return {
    status: "quoted",
    quote_id: `Q-${termsHash.slice(0, 12)}`,
    price: terms.price,
    currency: rateCard.currency,
    breakdown: breakdown.map(([label, factor]) => ({ label, factor })),
    base: formatCents(baseCents),
    floor_applied: floorApplied,
    terms,
    terms_hash: termsHash,
  };
}

export function confirmLicense(quote, { paid, paymentRef, currency }) {
  if (!quote?.terms || quote.status !== "quoted" ||
      quote.terms_hash !== sha256(canonical(quote.terms)) ||
      quote.quote_id !== `Q-${quote.terms_hash.slice(0, 12)}` ||
      quote.price !== quote.terms.price || quote.currency !== quote.terms.currency ||
      !currencyCode(quote.terms.currency) ||
      !["owner", "title", "rate_card_version", ...TERM_FIELDS.filter(field => field !== "audience")].every(field => termText(quote.terms[field])) ||
      !Number.isSafeInteger(quote.terms.audience) || quote.terms.audience < 0) {
    throw new QuoteError("tampered_quote", "quote terms no longer match terms_hash; re-quote");
  }
  if (!termText(paymentRef)) throw new QuoteError("needs_owner", "owner payment reference is required");
  if (!currencyCode(currency) || currency !== quote.terms.currency) throw new QuoteError("currency_mismatch", "owner-confirmed payment currency must match quote terms");
  const paidCents = decimal(paid, 2, "paid");
  const priceCents = decimal(quote.terms.price, 2, "quote price");
  if (paidCents < priceCents) {
    throw new QuoteError("underpaid", `owner-confirmed payment ${paid} is below quoted ${quote.price}`);
  }
  const record = {
    quote_id: quote.quote_id,
    terms_hash: quote.terms_hash,
    paid: formatCents(paidCents),
    currency,
    payment_ref_hash: sha256(String(paymentRef)),
  };
  const licenseHash = sha256(canonical(record));
  return {
    status: "licensed",
    license_id: `LIC-${licenseHash.slice(0, 16).toUpperCase()}`,
    license_hash: licenseHash,
    ...record,
    terms: quote.terms,
  };
}

const EVM = /^0x[0-9a-fA-F]{40}$/;
const SOLANA = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function computeSplits(sheet, amount) {
  const decimals = sheet.decimals ?? 6;
  const total = decimal(amount, decimals, "split amount");
  const unit = 10n ** BigInt(decimals);
  const people = sheet.collaborators ?? [];
  let bps = 0;
  const addressCheck = sheet.chain === "solana" ? SOLANA : EVM;
  const payouts = people.map((person) => {
    if (!Number.isInteger(person.share_bps) || person.share_bps <= 0) {
      throw new QuoteError("bad_split_sheet", `${person.name}: share_bps must be a positive integer`);
    }
    if (!addressCheck.test(person.address ?? "")) {
      throw new QuoteError("bad_split_sheet", `${person.name}: address is not a valid ${sheet.chain} address`);
    }
    bps += person.share_bps;
    const units = (total * BigInt(person.share_bps)) / 10000n;
    return { ...person, units };
  });
  if (bps > 10000) throw new QuoteError("bad_split_sheet", `shares total ${bps} bps, over 10000`);
  const paidOut = payouts.reduce((sum, p) => sum + p.units, 0n);
  const fmt = (units) => {
    const w = units / unit;
    const f = (units % unit).toString().padStart(decimals, "0").replace(/0+$/, "");
    return f ? `${w}.${f}` : `${w}`;
  };
  return {
    status: "split_preview",
    chain: sheet.chain,
    asset: sheet.asset,
    total: fmt(total),
    payouts: payouts.map((p) => ({
      name: p.name,
      role: p.role,
      address: p.address,
      share_bps: p.share_bps,
      amount_decimal: fmt(p.units),
    })),
    owner_retains: fmt(total - paidOut),
  };
}

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i].replace(/^--/, "");
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out[key] = true;
    else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));

export function main(argv) {
  const a = args(argv);
  try {
    let result;
    if (a.confirm) result = confirmLicense(readJson(a.quote), { paid: a.paid, currency: a.currency, paymentRef: a["payment-ref"] });
    else if (a.splits) result = computeSplits(readJson(a.splits), a.amount);
    else result = computeQuote(readJson(a["rate-card"]), readJson(a.request));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  } catch (error) {
    const code = error instanceof QuoteError ? error.code : "error";
    process.stdout.write(`${JSON.stringify({ status: code, message: error.message }, null, 2)}\n`);
    return 2;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = main(process.argv.slice(2));
}
