import { R5_VERSIONS } from "./lane-packet.mjs";

const ROOT_KEYS = Object.freeze([
  "proposal_schema_version",
  "supplier_id",
  "source_claims",
]);

const CLAIM_KEYS = Object.freeze([
  "field_name",
  "source_snapshot_digest",
  "source_span",
  "proposed_normalized_value",
]);

const SPAN_KEYS = Object.freeze([
  "representation",
  "provenance_class",
  "content_hash",
  "start",
  "end",
  "occurrence",
]);

const DIGEST_RE = /^[a-f0-9]{64}$/u;
const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const DEFAULT_LIMITS = Object.freeze({
  maxBytes: 32 * 1024,
  maxDepth: 8,
  maxStringLength: 4096,
  maxObjectKeys: 32,
  maxArrayLength: 32,
  maxClaims: 16,
});

export class R5ParserError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "R5ParserError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = {}) {
  throw new R5ParserError(code, message, details);
}

function isUnpairedSurrogate(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

function exactKeys(value, allowed, path) {
  const actual = Object.keys(value).sort();
  const expected = [...allowed].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail("UNKNOWN_OR_MISSING_KEY", `${path} has an unexpected or missing key`, { path, actual, expected });
  }
}

function requireString(value, path, max = 4096) {
  if (typeof value !== "string" || value.length === 0 || value.length > max || isUnpairedSurrogate(value)) fail("INVALID_STRING", `${path} is not a valid bounded string`, { path });
  return value;
}

function requireInteger(value, path) {
  if (!Number.isSafeInteger(value)) fail("INVALID_INTEGER", `${path} must be a safe integer`, { path });
  return value;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

class JsonReader {
  constructor(text, limits) {
    this.text = text;
    this.index = 0;
    this.limits = limits;
  }

  parse() {
    const value = this.parseValue(0);
    this.skipWhitespace();
    if (this.index !== this.text.length) fail("TRAILING_DATA", "worker output has trailing data");
    return value;
  }

  skipWhitespace() {
    while (this.index < this.text.length && /[\u0009\u000a\u000d\u0020]/u.test(this.text[this.index])) this.index += 1;
  }

  parseValue(depth) {
    if (depth > this.limits.maxDepth) fail("MAX_DEPTH", "worker output exceeds maximum nesting depth");
    this.skipWhitespace();
    const character = this.text[this.index];
    if (character === "{") return this.parseObject(depth + 1);
    if (character === "[") return this.parseArray(depth + 1);
    if (character === '"') return this.parseString();
    if (character === "t" && this.consumeLiteral("true")) return true;
    if (character === "f" && this.consumeLiteral("false")) return false;
    if (character === "n" && this.consumeLiteral("null")) return null;
    if (character === "-" || /[0-9]/u.test(character ?? "")) return this.parseNumber();
    fail("MALFORMED_JSON", "worker output contains an invalid JSON value", { offset: this.index });
  }

  consumeLiteral(literal) {
    if (this.text.slice(this.index, this.index + literal.length) !== literal) fail("MALFORMED_JSON", "worker output contains an invalid literal", { offset: this.index });
    this.index += literal.length;
    return true;
  }

  parseString() {
    const start = this.index;
    this.index += 1;
    while (this.index < this.text.length) {
      const character = this.text[this.index];
      if (character === '"') {
        this.index += 1;
        const raw = this.text.slice(start, this.index);
        let value;
        try {
          value = JSON.parse(raw);
        } catch {
          fail("MALFORMED_STRING", "worker output contains an invalid JSON string");
        }
        if (value.length > this.limits.maxStringLength || isUnpairedSurrogate(value)) fail("INVALID_UNICODE", "worker output contains an oversized or malformed Unicode string");
        return value;
      }
      const code = this.text.charCodeAt(this.index);
      if (code <= 0x1f) fail("MALFORMED_STRING", "worker output contains an unescaped control character");
      if (character === "\\") {
        this.index += 1;
        const escape = this.text[this.index];
        if (!escape || !'"\\/bfnrtu'.includes(escape)) fail("MALFORMED_STRING", "worker output contains an invalid escape");
        if (escape === "u") {
          const hex = this.text.slice(this.index + 1, this.index + 5);
          if (!/^[0-9a-f]{4}$/iu.test(hex)) fail("MALFORMED_STRING", "worker output contains an invalid Unicode escape");
          this.index += 4;
        }
      }
      this.index += 1;
    }
    fail("MALFORMED_STRING", "worker output contains an unterminated string");
  }

  parseNumber() {
    const match = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/u.exec(this.text.slice(this.index));
    if (!match) fail("MALFORMED_NUMBER", "worker output contains an invalid number");
    this.index += match[0].length;
    const value = Number(match[0]);
    if (!Number.isFinite(value)) fail("NONFINITE_NUMBER", "worker output contains a non-finite number");
    return value;
  }

  parseArray(depth) {
    this.index += 1;
    const result = [];
    this.skipWhitespace();
    if (this.text[this.index] === "]") {
      this.index += 1;
      return result;
    }
    while (true) {
      if (result.length >= this.limits.maxArrayLength) fail("MAX_ARRAY_LENGTH", "worker output array is too large");
      result.push(this.parseValue(depth));
      this.skipWhitespace();
      if (this.text[this.index] === ",") {
        this.index += 1;
        continue;
      }
      if (this.text[this.index] === "]") {
        this.index += 1;
        return result;
      }
      fail("MALFORMED_ARRAY", "worker output contains an unterminated array");
    }
  }

  parseObject(depth) {
    this.index += 1;
    const result = Object.create(null);
    const keys = new Set();
    this.skipWhitespace();
    if (this.text[this.index] === "}") {
      this.index += 1;
      return result;
    }
    while (true) {
      if (keys.size >= this.limits.maxObjectKeys) fail("MAX_OBJECT_KEYS", "worker output object is too large");
      this.skipWhitespace();
      if (this.text[this.index] !== '"') fail("MALFORMED_OBJECT", "worker output object key must be a string");
      const key = this.parseString();
      if (DANGEROUS_KEYS.has(key)) fail("DANGEROUS_KEY", "worker output contains a prototype-pollution key");
      if (keys.has(key)) fail("DUPLICATE_KEY", "worker output contains a duplicate key");
      keys.add(key);
      this.skipWhitespace();
      if (this.text[this.index] !== ":") fail("MALFORMED_OBJECT", "worker output object is missing a colon");
      this.index += 1;
      result[key] = this.parseValue(depth);
      this.skipWhitespace();
      if (this.text[this.index] === ",") {
        this.index += 1;
        continue;
      }
      if (this.text[this.index] === "}") {
        this.index += 1;
        return result;
      }
      fail("MALFORMED_OBJECT", "worker output contains an unterminated object");
    }
  }
}

function validateProposedValue(value, path) {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return;
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("PROPOSED_VALUE_TYPE", `${path} must be a scalar or plain object`, { path });
  for (const child of Object.values(value)) validateProposedValue(child, `${path}.*`);
}

function validateShape(value, limits) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("ROOT_TYPE", "worker proposal must be an object");
  exactKeys(value, ROOT_KEYS, "proposal");
  if (value.proposal_schema_version !== R5_VERSIONS.proposal) fail("PROPOSAL_VERSION", "worker proposal schema version is unsupported");
  requireString(value.supplier_id, "proposal.supplier_id", 256);
  if (!Array.isArray(value.source_claims) || value.source_claims.length > limits.maxClaims) fail("CLAIM_COUNT", "worker proposal has too many claims");
  for (const [index, claim] of value.source_claims.entries()) {
    const path = `proposal.source_claims[${index}]`;
    if (!claim || typeof claim !== "object" || Array.isArray(claim)) fail("CLAIM_TYPE", `${path} must be an object`, { path });
    exactKeys(claim, CLAIM_KEYS, path);
    requireString(claim.field_name, `${path}.field_name`, 100);
    requireString(claim.source_snapshot_digest, `${path}.source_snapshot_digest`, 64);
    if (!DIGEST_RE.test(claim.source_snapshot_digest)) fail("CLAIM_DIGEST", `${path}.source_snapshot_digest must be lowercase SHA-256 hex`, { path });
    const span = claim.source_span;
    if (!span || typeof span !== "object" || Array.isArray(span)) fail("SPAN_TYPE", `${path}.source_span must be an object`, { path });
    exactKeys(span, SPAN_KEYS, `${path}.source_span`);
    if (span.representation !== "TEXT" || span.provenance_class !== "CURRENT_MESSAGE") fail("SPAN_AUTHORITY", `${path}.source_span is not a current text span`, { path });
    requireString(span.content_hash, `${path}.source_span.content_hash`, 64);
    if (!DIGEST_RE.test(span.content_hash)) fail("SPAN_DIGEST", `${path}.source_span.content_hash must be lowercase SHA-256 hex`, { path });
    requireInteger(span.start, `${path}.source_span.start`);
    requireInteger(span.end, `${path}.source_span.end`);
    requireInteger(span.occurrence, `${path}.source_span.occurrence`);
    if (span.start < 0 || span.end <= span.start || span.occurrence < 0) fail("SPAN_RANGE", `${path}.source_span range is invalid`, { path });
    validateProposedValue(claim.proposed_normalized_value, `${path}.proposed_normalized_value`);
  }
  return true;
}

export function parseStrictJson(raw, options = {}) {
  if (typeof raw !== "string") fail("RAW_OUTPUT_TYPE", "worker output must be a string");
  const limits = { ...DEFAULT_LIMITS, ...options };
  if (Buffer.byteLength(raw, "utf8") > limits.maxBytes) fail("MAX_OUTPUT_BYTES", "worker output exceeds maximum byte length");
  return new JsonReader(raw, limits).parse();
}

export function parseWorkerProposal(raw, options = {}) {
  const limits = { ...DEFAULT_LIMITS, ...options };
  const parsed = parseStrictJson(raw, limits);
  validateShape(parsed, limits);
  return deepFreeze(parsed);
}

export { DEFAULT_LIMITS, ROOT_KEYS, CLAIM_KEYS, SPAN_KEYS };
