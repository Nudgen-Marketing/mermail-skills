import { canonicalize, sha256Canonical } from "../authority/manifest-round-compiler.mjs";

export { canonicalize, sha256Canonical };

export const R8_VERSION = "r8.effect-gateway.v1";
export const INTENT_VERSION = "r8.effect-intent.v1";
export const PREVIEW_VERSION = "r8.effect-preview.v1";
export const APPROVAL_CANDIDATE_VERSION = "r8.effect-approval-candidate.v1";
export const APPROVAL_VERSION = "r8.effect-approval-record.v1";
export const JOURNAL_VERSION = "r8.effect-journal.v1";

export const EFFECT_TYPES = Object.freeze(["SEND_EMAIL", "REPLY_TO_EMAIL"]);
export const EFFECT_STATES = Object.freeze([
  "NOT_AUTHORIZED",
  "PREVIEWED",
  "APPROVED",
  "DISPATCH_RESERVED",
  "PRE_EXECUTION_REJECTED",
  "MUTATION_ACCEPTED",
  "AMBIGUOUS",
  "OBSERVED_PROVIDER_DELIVERED",
  "OBSERVED_IN_RECIPIENT_MAILBOX",
  "RECONCILIATION_CONFLICT",
]);

export class R8Error extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "R8Error";
    this.code = code;
    this.details = details;
  }
}

export function fail(code, message, details = {}) {
  throw new R8Error(code, message, details);
}

export function clone(value) {
  return structuredClone(value);
}

export function isPlainObject(value) {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function exactKeys(value, allowed, path = "value") {
  if (!isPlainObject(value)) fail("INVALID_OBJECT", `${path} must be a plain object`);
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(value).filter((key) => !allowedSet.has(key));
  if (unknown.length) fail("UNKNOWN_FIELD", `${path} contains unknown field(s): ${unknown.join(", ")}`, { unknown });
}

export function requiredKeys(value, required, path = "value") {
  for (const key of required) if (!Object.hasOwn(value, key)) fail("MISSING_FIELD", `${path}.${key} is required`);
}

export function string(value, path, { max = 4096, nonempty = true } = {}) {
  if (typeof value !== "string" || (nonempty && value.length === 0) || value.length > max) fail("INVALID_STRING", `${path} must be a bounded string`);
  return value;
}

export function nullableString(value, path, options = {}) {
  if (value === null) return null;
  return string(value, path, options);
}

export function digest(value, path) {
  string(value, path, { max: 64 });
  if (!/^[a-f0-9]{64}$/u.test(value)) fail("INVALID_DIGEST", `${path} must be a lowercase SHA-256 digest`);
  return value;
}

export function address(value, path) {
  string(value, path, { max: 320 });
  const normalized = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalized)) fail("INVALID_ADDRESS", `${path} must be a bare email address`);
  return normalized;
}

export function id(value, path, { max = 256 } = {}) {
  string(value, path, { max });
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(value)) fail("INVALID_ID", `${path} is not a safe identifier`);
  return value;
}

export function utc(value, path) {
  string(value, path, { max: 40 });
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u.test(value) || Number.isNaN(Date.parse(value))) fail("INVALID_TIMESTAMP", `${path} must be an explicit UTC timestamp`);
  return new Date(value).toISOString();
}

export function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

export function withDigest(value, field = "digest") {
  const copy = clone(value);
  copy[field] = null;
  const result = clone(value);
  result[field] = sha256Canonical(copy);
  return result;
}

export function digestWithout(value, field) {
  const copy = clone(value);
  copy[field] = null;
  return sha256Canonical(copy);
}
