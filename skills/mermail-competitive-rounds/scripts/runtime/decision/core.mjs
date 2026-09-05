import { canonicalize, sha256Canonical } from "../authority/manifest-round-compiler.mjs";

export { canonicalize, sha256Canonical };

export const R7_VERSION = "r7.evaluator.v1";
export const R7_EVIDENCE_VERSION = "r7.evidence.v1";
export const R7_OFFER_VERSION = "r7.offer.v1";
export const R7_ARTIFACT_VERSION = "r7.evaluation-artifact.v1";

export const EVIDENCE_STATES = Object.freeze(["VERIFIED", "UNKNOWN", "BLOCKED", "CONFLICT", "NOT_APPLICABLE"]);
export const DIRECTIONS = Object.freeze(["MINIMIZE", "MAXIMIZE", "NONE"]);
export const FIELD_TYPES = Object.freeze(["INTEGER", "MONEY", "TEXT", "DURATION"]);

export class R7Error extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "R7Error";
    this.code = code;
    this.details = details;
  }
}

export function fail(code, message, details = {}) {
  throw new R7Error(code, message, details);
}

export function isPlainObject(value) {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function clone(value) {
  return structuredClone(value);
}

export function exactKeys(value, keys, path = "value") {
  if (!isPlainObject(value)) fail("INVALID_OBJECT", `${path} must be a plain object`, { path });
  const allowed = new Set(keys);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) fail("UNKNOWN_FIELD", `${path} contains unknown field(s): ${unknown.join(", ")}`, { path, unknown });
}

export function requiredKeys(value, keys, path = "value") {
  for (const key of keys) if (!Object.prototype.hasOwnProperty.call(value, key)) fail("MISSING_FIELD", `${path}.${key} is required`, { path: `${path}.${key}` });
}

export function string(value, path, { max = 4096, nonempty = true } = {}) {
  if (typeof value !== "string" || (nonempty && value.length === 0) || value.length > max) fail("INVALID_STRING", `${path} must be a string`, { path });
  return value;
}

export function digest(value, path) {
  string(value, path, { max: 64 });
  if (!/^[a-f0-9]{64}$/u.test(value)) fail("INVALID_DIGEST", `${path} must be a lowercase SHA-256 digest`, { path });
  return value;
}

export function integer(value, path, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < min || value > max) fail("INVALID_INTEGER", `${path} must be a safe integer`, { path });
  return value;
}

export function utc(value, path) {
  string(value, path, { max: 40 });
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u.test(value) || Number.isNaN(Date.parse(value))) fail("INVALID_TIMESTAMP", `${path} must be an explicit UTC timestamp`, { path });
  return new Date(value).toISOString();
}

export function normalizeAddress(value, path) {
  string(value, path, { max: 320 });
  const normalized = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalized) || normalized.includes("<") || normalized.includes(">")) fail("INVALID_ADDRESS", `${path} must be a bare email address`, { path });
  return normalized;
}

export function without(value, key) {
  const copy = clone(value);
  delete copy[key];
  return copy;
}

export function recordDigest(value, digestKey = "record_digest") {
  return sha256Canonical(without(value, digestKey));
}

export function money(value, path) {
  if (!isPlainObject(value)) fail("INVALID_MONEY", `${path} must be a minor-unit money object`, { path });
  exactKeys(value, ["minor_units", "currency"], path);
  requiredKeys(value, ["minor_units", "currency"], path);
  integer(value.minor_units, `${path}.minor_units`, { min: 0 });
  string(value.currency, `${path}.currency`, { max: 3 });
  if (!/^[A-Z]{3}$/u.test(value.currency)) fail("INVALID_CURRENCY", `${path}.currency must be an ISO-like uppercase code`, { path });
  return { minor_units: value.minor_units, currency: value.currency };
}

export function typedValue(type, value, path, { unit = null, currency = null } = {}) {
  if (type === "MONEY") {
    const normalized = money(value, path);
    if (currency !== null && normalized.currency !== currency) fail("CURRENCY_MISMATCH", `${path}.currency does not match the field schema`, { path });
    return normalized;
  }
  if (type === "INTEGER" || type === "DURATION") {
    if (!isPlainObject(value)) fail("INVALID_TYPED_VALUE", `${path} must be an object`, { path });
    exactKeys(value, ["integer"], path);
    requiredKeys(value, ["integer"], path);
    integer(value.integer, `${path}.integer`, { min: 0 });
    return { integer: value.integer };
  }
  if (type === "TEXT") {
    string(value, path, { max: 4096 });
    return value;
  }
  fail("UNKNOWN_FIELD_TYPE", `unsupported field type ${type}`, { path, type, unit });
}

export function compareValues(field, left, right) {
  const a = typedValue(field.type, left, "left", { unit: field.unit, currency: field.currency });
  const b = typedValue(field.type, right, "right", { unit: field.unit, currency: field.currency });
  if (field.type === "MONEY") return a.minor_units === b.minor_units ? 0 : (a.minor_units < b.minor_units ? -1 : 1);
  if (field.type === "INTEGER" || field.type === "DURATION") return a.integer === b.integer ? 0 : (a.integer < b.integer ? -1 : 1);
  if (field.type === "TEXT") return a === b ? 0 : null;
  return null;
}

export function canonicalBytes(value) {
  return Buffer.from(canonicalize(value), "utf8");
}

export function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}
