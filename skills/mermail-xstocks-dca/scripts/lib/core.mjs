import { createHash } from "node:crypto";

export class DcaError extends Error {
  constructor(code, detail) {
    super(detail === undefined ? code : `${code}: ${detail}`);
    this.code = code;
  }
}

// Deterministic JSON: sorted keys, no whitespace, integers only. Money always travels as
// decimal strings, so a float reaching this function is a bug and is rejected.
export function canonical(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new DcaError("canonical_number", String(value));
    return String(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object") {
    const keys = Object.keys(value).filter((key) => value[key] !== undefined).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  throw new DcaError("canonical_type", typeof value);
}

export const sha256Hex = (text) => createHash("sha256").update(text, "utf8").digest("hex");

const DECIMAL = /^(0|[1-9]\d*)(?:\.(\d+))?$/;

export function toBaseUnits(value, decimals) {
  if (typeof value !== "string") throw new DcaError("amount_not_string", String(value));
  const match = DECIMAL.exec(value);
  if (!match) throw new DcaError("amount_malformed", value);
  const fraction = match[2] ?? "";
  if (fraction.length > decimals) throw new DcaError("amount_too_precise", value);
  return BigInt(match[1] + fraction.padEnd(decimals, "0"));
}

export function fromBaseUnits(raw, decimals) {
  const value = BigInt(raw);
  const negative = value < 0n;
  const digits = (negative ? -value : value).toString().padStart(decimals + 1, "0");
  const whole = digits.slice(0, digits.length - decimals);
  const fraction = digits.slice(digits.length - decimals).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

// Provider prices arrive as "779.41" or "2.1e-6"; normalise to plain decimal text and
// truncate (never round up) beyond `decimals` fractional digits.
export function normalizeDecimal(value, decimals = 18) {
  const text = String(value).trim();
  const match = /^(-?)(\d+)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(text);
  if (!match) throw new DcaError("decimal_malformed", text);
  const [, sign, whole, fraction = "", exponent = "0"] = match;
  let digits = whole + fraction;
  let point = whole.length + Number(exponent);
  if (point <= 0) {
    digits = "0".repeat(1 - point) + digits;
    point = 1;
  }
  digits = digits.padEnd(point, "0");
  const integer = digits.slice(0, point).replace(/^0+(?=\d)/, "");
  const decimalsPart = digits.slice(point, point + decimals).replace(/0+$/, "");
  const body = decimalsPart ? `${integer}.${decimalsPart}` : integer;
  return sign && /[1-9]/.test(body) ? `-${body}` : body;
}

// Display arithmetic (shares, marks, PnL) uses 18-decimal fixed point on BigInt.
export const SCALE = 18;
const ONE = 10n ** BigInt(SCALE);
export const toScaled = (value) => toBaseUnits(normalizeDecimal(value, SCALE), SCALE);
export const rawToScaled = (raw, decimals) => BigInt(raw) * 10n ** BigInt(SCALE - decimals);
export const mulScaled = (a, b) => (a * b) / ONE;
export const divScaled = (a, b) => (b === 0n ? null : (a * ONE) / b);

export function formatScaled(value, places) {
  const [whole, fraction = ""] = fromBaseUnits(value, SCALE).split(".");
  const cut = fraction.slice(0, places).replace(/0+$/, "");
  const text = cut ? `${whole}.${cut}` : whole;
  return text === "-0" ? "0" : text;
}

const DURATION = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/;

export function parseDuration(text) {
  const match = typeof text === "string" ? DURATION.exec(text) : null;
  if (!match || text === "P" || text.endsWith("T")) throw new DcaError("duration_malformed", String(text));
  const [, days = "0", hours = "0", minutes = "0"] = match;
  const ms = ((Number(days) * 24 + Number(hours)) * 60 + Number(minutes)) * 60_000;
  if (ms < 60_000) throw new DcaError("duration_too_short", text);
  return ms;
}

const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/;

export function parseInstant(text) {
  const ms = typeof text === "string" && INSTANT.test(text) ? Date.parse(text) : Number.NaN;
  if (Number.isNaN(ms)) throw new DcaError("instant_malformed", String(text));
  return ms;
}

const succeeds = (fn) => (value) => {
  try {
    fn(value);
    return true;
  } catch {
    return false;
  }
};
export const isDuration = succeeds(parseDuration);
export const isInstant = succeeds(parseInstant);
