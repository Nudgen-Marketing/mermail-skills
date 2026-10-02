#!/usr/bin/env node
// Deterministic pricing, license IDs, and split math for mermail-licensing-desk.
// No network, no dependencies, no wallet access. Prices come only from the owner's rate card.
//
//   node quote.mjs --rate-card rate-card.json --request request.json
//   node quote.mjs --confirm --quote quote.json --paid 1800 --payment-ref "owner ref"
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

function lookup(table, key, label) {
  if (!table || !(key in table)) {
    throw new QuoteError("needs_owner", `rate card has no ${label} rate for "${key}"`);
  }
  const factor = table[key];
  if (factor === null) {
    throw new QuoteError("needs_owner", `rate card marks ${label} "${key}" unavailable`);
  }
  if (typeof factor !== "number" || !(factor > 0)) {
    throw new QuoteError("bad_rate_card", `${label} "${key}" factor must be a positive number`);
  }
  return factor;
}

function audienceFactor(tiers, audience) {
  if (!Array.isArray(tiers) || tiers.length === 0) return 1;
  if (!Number.isInteger(audience) || audience < 0) {
    throw new QuoteError("needs_clarification", "audience must be a non-negative integer");
  }
  for (const tier of tiers) {
    if (tier.max === null || audience <= tier.max) return tier.factor;
  }
  throw new QuoteError("needs_owner", `audience ${audience} exceeds every rate card tier`);
}

export function formatCents(cents) {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export function computeQuote(rateCard, request) {
  const missing = TERM_FIELDS.filter((field) => request[field] === undefined || request[field] === "");
  if (missing.length) {
    throw new QuoteError("needs_clarification", `inquiry is missing: ${missing.join(", ")}`);
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
  if (typeof item.base !== "number" || !(item.base > 0)) {
    throw new QuoteError("needs_owner", `owner has not set a base rate for "${request.item}"`);
  }
  if (item.floor !== undefined && (typeof item.floor !== "number" || item.floor < 0)) {
    throw new QuoteError("needs_owner", `owner has not set a floor for "${request.item}"`);
  }
  const m = rateCard.multipliers ?? {};
  const breakdown = [["base", 1]];
  breakdown.push([`media:${request.media}`, lookup(m.media, request.media, "media")]);
  breakdown.push([`territory:${request.territory}`, lookup(m.territory, request.territory, "territory")]);
  breakdown.push([`term:${request.term}`, lookup(m.term, request.term, "term")]);
  breakdown.push([`exclusivity:${request.exclusivity}`, lookup(m.exclusivity, request.exclusivity, "exclusivity")]);
  breakdown.push([`audience:${request.audience}`, audienceFactor(m.audience, request.audience)]);
  const rush = rateCard.rush;
  if (rush && Number.isInteger(request.deadline_days) && request.deadline_days < rush.days_under) {
    breakdown.push([`rush:<${rush.days_under}d`, rush.factor]);
  }
  const baseCents = Math.round(item.base * 100);
  let cents = baseCents;
  for (const [, factor] of breakdown) cents = Math.round(cents * factor);
  const floorCents = Math.round((item.floor ?? 0) * 100);
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

export function confirmLicense(quote, { paid, paymentRef }) {
  if (!quote?.terms || quote.terms_hash !== sha256(canonical(quote.terms))) {
    throw new QuoteError("tampered_quote", "quote terms no longer match terms_hash; re-quote");
  }
  if (!paymentRef) throw new QuoteError("needs_owner", "owner payment reference is required");
  const paidCents = Math.round(Number(paid) * 100);
  const priceCents = Math.round(Number(quote.price) * 100);
  if (!Number.isFinite(paidCents) || paidCents < priceCents) {
    throw new QuoteError("underpaid", `owner-confirmed payment ${paid} is below quoted ${quote.price}`);
  }
  const record = {
    quote_id: quote.quote_id,
    terms_hash: quote.terms_hash,
    paid: formatCents(paidCents),
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
  const unit = 10n ** BigInt(decimals);
  const [whole, frac = ""] = String(amount).split(".");
  if (!/^\d+$/.test(whole) || !/^\d*$/.test(frac) || frac.length > decimals) {
    throw new QuoteError("bad_amount", `amount must be a decimal with at most ${decimals} places`);
  }
  const total = BigInt(whole) * unit + BigInt((frac || "0").padEnd(decimals, "0"));
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
    if (a.confirm) result = confirmLicense(readJson(a.quote), { paid: a.paid, paymentRef: a["payment-ref"] });
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
