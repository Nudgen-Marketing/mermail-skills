import { promises as fs } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { canonicalBytes, isPlainObject, sha256Bytes, sha256Canonical } from "./canonical.mjs";
import { fail, R6Error } from "./errors.mjs";
import {
  validateSourceSnapshot,
  validateEvidenceRecord,
} from "../evidence/adapter-evidence.mjs";
import { validateRecipientEvidence } from "../evidence/recipient-evidence.mjs";
import { validateLanePacket as validateR5LanePacket } from "../worker/lane-packet.mjs";
import { validateDeclassifiedOutput } from "../worker/declassifier.mjs";

export const ARTIFACT_TYPES = Object.freeze([
  "R3_FROZEN_MANIFEST",
  "R3_ROUND_STATE",
  "R3_LANE_PACKET",
  "R4_SOURCE_SNAPSHOT",
  "R4_EVIDENCE_RECORD",
  "R4R_EVIDENCE_RECORD",
  "R5_LANE_PACKET",
  "R5_DECLASSIFIED_RESULT",
  "R5_RAW_WORKER_OUTPUT",
]);

const DIGEST_RE = /^[a-f0-9]{64}$/u;

function assertDigest(digest, path = "digest") {
  if (typeof digest !== "string" || !DIGEST_RE.test(digest)) fail("INVALID_ARTIFACT_DIGEST", `${path} must be a lowercase SHA-256 digest`);
}

function artifactDirectory(root) {
  return join(resolve(root), "artifacts");
}

export function artifactPath(root, digest) {
  assertDigest(digest);
  const directory = artifactDirectory(root);
  const candidate = resolve(directory, digest);
  if (candidate !== join(directory, digest) || !candidate.startsWith(`${directory}${sep}`)) fail("UNSAFE_ARTIFACT_PATH", "artifact path escaped the content-addressed store");
  return candidate;
}

async function flushFile(handle) {
  if (typeof handle.sync === "function") await handle.sync();
}

export async function ensureArtifactStore(root) {
  await fs.mkdir(artifactDirectory(root), { recursive: true });
}

export async function putArtifact(root, bytes) {
  const buffer = Buffer.isBuffer(bytes) ? Buffer.from(bytes) : Buffer.from(bytes);
  const digest = sha256Bytes(buffer);
  await ensureArtifactStore(root);
  const target = artifactPath(root, digest);
  try {
    const existing = await fs.readFile(target);
    if (!existing.equals(buffer)) fail("ARTIFACT_DIGEST_COLLISION", "an existing artifact path contains different bytes");
    return Object.freeze({ digest, byte_length: buffer.length, existed: true });
  } catch (error) {
    if (error instanceof R6Error) throw error;
    if (error.code !== "ENOENT") throw error;
  }
  const temporary = join(artifactDirectory(root), `.${digest}.${process.pid}.${randomUUID()}.tmp`);
  const handle = await fs.open(temporary, "wx");
  try {
    await handle.writeFile(buffer);
    await flushFile(handle);
  } finally {
    await handle.close();
  }
  try {
    await fs.rename(temporary, target);
  } catch (error) {
    if (error.code === "EEXIST" || error.code === "EPERM" || error.code === "ENOTEMPTY") {
      const existing = await fs.readFile(target);
      if (!existing.equals(buffer)) fail("ARTIFACT_DIGEST_COLLISION", "artifact target changed during concurrent write");
      await fs.rm(temporary, { force: true });
    } else {
      await fs.rm(temporary, { force: true });
      throw error;
    }
  }
  return Object.freeze({ digest, byte_length: buffer.length, existed: false });
}

export async function putJsonArtifact(root, value) {
  return putArtifact(root, canonicalBytes(value));
}

export async function readArtifact(root, digest) {
  const bytes = await fs.readFile(artifactPath(root, digest));
  const actual = sha256Bytes(bytes);
  if (actual !== digest) fail("ARTIFACT_DIGEST_MISMATCH", "artifact bytes do not match the requested digest", { digest, actual });
  return bytes;
}

export async function readJsonArtifact(root, digest) {
  const bytes = await readArtifact(root, digest);
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    fail("ARTIFACT_NOT_JSON", "artifact is not valid JSON", { digest, message: error.message });
  }
}

export async function verifyArtifactReference(root, reference) {
  validateArtifactReference(reference);
  try {
    const bytes = await readArtifact(root, reference.digest);
    return Object.freeze({ ...reference, exists: true, byte_length: bytes.length, bytes_digest: reference.digest });
  } catch (error) {
    if (error.code === "ENOENT") return Object.freeze({ ...reference, exists: false, reason: "ARTIFACT_MISSING" });
    throw error;
  }
}

export function validateArtifactReference(reference, path = "artifact_ref") {
  if (!isPlainObject(reference)) fail("INVALID_ARTIFACT_REF", `${path} must be an object`);
  const keys = Object.keys(reference);
  if (keys.length !== 2 || !keys.includes("digest") || !keys.includes("artifact_type")) fail("INVALID_ARTIFACT_REF", `${path} has an unexpected shape`);
  assertDigest(reference.digest, `${path}.digest`);
  if (!ARTIFACT_TYPES.includes(reference.artifact_type)) fail("UNKNOWN_ARTIFACT_TYPE", `${path}.artifact_type is not supported`, { artifact_type: reference.artifact_type });
  return true;
}

function assertDigestField(value, field) {
  if (typeof value !== "string" || !DIGEST_RE.test(value)) fail("INVALID_ARTIFACT_CONTENT", `${field} is not a digest`);
}

function validateR3FrozenManifest(value) {
  if (!isPlainObject(value) || value.type !== "FROZEN_MANIFEST" || !isPlainObject(value.manifest)) fail("INVALID_ARTIFACT_CONTENT", "R3 manifest artifact is not a frozen manifest");
  assertDigestField(value.manifest_digest, "manifest_digest");
  if (sha256Canonical(value.manifest) !== value.manifest_digest) fail("INVALID_ARTIFACT_CONTENT", "frozen manifest digest does not match manifest");
  if (value.manifest_identity !== `${value.manifest.sourcing_id}-manifest-${value.manifest.manifest_revision}`) fail("INVALID_ARTIFACT_CONTENT", "frozen manifest identity is not derived");
  return true;
}

function validateR3RoundState(value) {
  if (!isPlainObject(value) || value.type !== "ROUND_STATE") fail("INVALID_ARTIFACT_CONTENT", "R3 round artifact is not a round state");
  const withoutDigest = structuredClone(value);
  delete withoutDigest.state_digest;
  assertDigestField(value.state_digest, "state_digest");
  if (sha256Canonical(withoutDigest) !== value.state_digest) fail("INVALID_ARTIFACT_CONTENT", "R3 round state digest does not match state");
  if (typeof value.sourcing_id !== "string" || typeof value.round_id !== "string" || typeof value.status !== "string") fail("INVALID_ARTIFACT_CONTENT", "R3 round state lacks identity/status");
  return true;
}

export async function validateArtifactForReference(root, reference) {
  validateArtifactReference(reference);
  const value = reference.artifact_type === "R5_RAW_WORKER_OUTPUT"
    ? null
    : await readJsonArtifact(root, reference.digest);
  switch (reference.artifact_type) {
    case "R3_FROZEN_MANIFEST": return validateR3FrozenManifest(value);
    case "R3_ROUND_STATE": return validateR3RoundState(value);
    case "R3_LANE_PACKET":
      if (!isPlainObject(value) || value.packet_type !== "LANE") fail("INVALID_ARTIFACT_CONTENT", "R3 lane packet type is invalid");
      return true;
    case "R4_SOURCE_SNAPSHOT": return validateSourceSnapshot(value);
    case "R4_EVIDENCE_RECORD": return validateEvidenceRecord(value);
    case "R4R_EVIDENCE_RECORD": return validateRecipientEvidence(value);
    case "R5_LANE_PACKET": return validateR5LanePacket(value);
    case "R5_DECLASSIFIED_RESULT": return validateDeclassifiedOutput(value);
    case "R5_RAW_WORKER_OUTPUT": {
      const bytes = await readArtifact(root, reference.digest);
      if (bytes.length > 128 * 1024) fail("ARTIFACT_TOO_LARGE", "raw worker artifact exceeds the bounded research limit");
      return true;
    }
    default: fail("UNKNOWN_ARTIFACT_TYPE", `unsupported artifact type ${reference.artifact_type}`);
  }
}

export function artifactRef(digest, artifact_type) {
  const ref = { digest, artifact_type };
  validateArtifactReference(ref);
  return Object.freeze(ref);
}
