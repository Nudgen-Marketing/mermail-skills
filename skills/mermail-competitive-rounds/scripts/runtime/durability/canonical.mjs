import {
  canonicalize,
  canonicalBytes,
  sha256Canonical,
} from "../authority/manifest-round-compiler.mjs";
import { createHash } from "node:crypto";

export { canonicalize, canonicalBytes, sha256Canonical };

export function sha256Bytes(value) {
  return createHash("sha256").update(Buffer.isBuffer(value) ? value : Buffer.from(value)).digest("hex");
}
export function cloneJson(value) {
  return structuredClone(value);
}

export function isPlainObject(value) {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function digestWithout(value, key) {
  const copy = cloneJson(value);
  delete copy[key];
  return sha256Canonical(copy);
}
