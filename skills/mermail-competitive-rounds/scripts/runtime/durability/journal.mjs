import { promises as fs } from "node:fs";
import { join, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import {
  canonicalize,
  cloneJson,
  sha256Canonical,
} from "./canonical.mjs";
import {
  buildEvent,
  commandSemanticDigest,
  COMMAND_KEYS,
  eventDigestFor,
  eventIdFor,
  genesisDigest,
  validateCommand,
  validateEventEnvelope,
  R6_VERSIONS,
} from "./event-schema.mjs";
import {
  artifactPath,
  readArtifact,
  readJsonArtifact,
  verifyArtifactReference,
  validateArtifactForReference,
  validateArtifactReference,
} from "./artifact-store.mjs";
import { createEmptyState, reduceEvents, stateDigest } from "./reducer.mjs";
import { errorCode, fail, R6Error } from "./errors.mjs";

const JOURNAL_FILE = "events.jsonl";
const CHECKPOINT_FILE = "journal.head.json";
const LOCK_FILE = ".journal.lock";
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
const DIGEST_RE = /^[a-f0-9]{64}$/u;
const UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

export const FAILPOINTS = Object.freeze([
  "BEFORE_EVENT_APPEND",
  "PARTIAL_EVENT_WRITE",
  "AFTER_EVENT_WRITE",
  "AFTER_JOURNAL_FSYNC_BEFORE_CHECKPOINT",
  "AFTER_CHECKPOINT_BEFORE_RETURN",
]);

function pathsFor(root) {
  const base = resolve(root);
  return Object.freeze({
    root: base,
    journal: join(base, JOURNAL_FILE),
    checkpoint: join(base, CHECKPOINT_FILE),
    lock: join(base, LOCK_FILE),
  });
}

export function journalPaths(root) {
  return pathsFor(root);
}

async function exists(path) {
  try { await fs.access(path); return true; } catch { return false; }
}

async function flush(handle) {
  if (typeof handle.sync === "function") await handle.sync();
}

function assertSafeSourcingId(value) {
  if (typeof value !== "string" || !ID_RE.test(value)) fail("INVALID_SOURCING_ID", "sourcing_id is not a safe aggregate identifier");
}

function assertDigest(value, path) {
  if (typeof value !== "string" || !DIGEST_RE.test(value)) fail("INVALID_DIGEST", `${path} must be a lowercase SHA-256 digest`);
}

function crashFailpoint(name) {
  if (name) fail("FAILPOINT", `research failpoint ${name} stopped the append`, { failpoint: name });
}

async function acquireLock(root, { timeout_ms = 5_000, stale_ms = 15_000 } = {}) {
  const paths = pathsFor(root);
  const started = Date.now();
  const owner = { pid: process.pid, acquired_at: new Date().toISOString(), nonce: randomUUID() };
  while (Date.now() - started < timeout_ms) {
    try {
      const handle = await fs.open(paths.lock, "wx");
      await handle.writeFile(JSON.stringify(owner));
      await flush(handle);
      await handle.close();
      return async () => {
        try {
          const current = JSON.parse(await fs.readFile(paths.lock, "utf8"));
          if (current.nonce === owner.nonce) await fs.rm(paths.lock, { force: true });
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
      };
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      let stale = false;
      try {
        const current = JSON.parse(await fs.readFile(paths.lock, "utf8"));
        const age = Date.now() - Date.parse(current.acquired_at);
        let alive = true;
        try { process.kill(current.pid, 0); } catch { alive = false; }
        stale = !alive || (Number.isFinite(age) && age > stale_ms);
      } catch (readError) {
        stale = readError.code === "ENOENT" || readError instanceof SyntaxError;
      }
      if (stale) {
        await fs.rm(paths.lock, { force: true });
        continue;
      }
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
    }
  }
  fail("JOURNAL_LOCK_TIMEOUT", "journal writer could not acquire the aggregate lock");
}

function canonicalLine(value) {
  return `${canonicalize(value)}\n`;
}

function parseJournalBytes(bytes, sourcing_id = null) {
  const text = Buffer.from(bytes).toString("utf8");
  if (!Buffer.from(text, "utf8").equals(Buffer.from(bytes))) fail("JOURNAL_ENCODING_ERROR", "journal bytes are not valid UTF-8");
  const hasTrailingNewline = text.length === 0 || text.endsWith("\n");
  const lines = text.split("\n");
  const completeLines = hasTrailingNewline ? lines.slice(0, -1) : lines.slice(0, -1);
  const tailText = hasTrailingNewline ? "" : lines.at(-1);
  const events = [];
  for (const [index, line] of completeLines.entries()) {
    if (line.length === 0) fail("JOURNAL_EMPTY_LINE", `journal line ${index + 1} is empty`);
    let value;
    try { value = JSON.parse(line); } catch (error) { fail("JOURNAL_PARSE_ERROR", `journal line ${index + 1} is not valid JSON`, { line: index + 1, message: error.message }); }
    validateEventEnvelope(value, { expected_sourcing_id: sourcing_id });
    events.push(value);
  }
  let tail = null;
  if (tailText.length > 0) {
    try {
      const value = JSON.parse(tailText);
      validateEventEnvelope(value, { expected_sourcing_id: sourcing_id });
      tail = { kind: "VALID_EVENT_WITHOUT_NEWLINE", value, byte_length: Buffer.byteLength(tailText, "utf8") };
    } catch (error) {
      tail = { kind: "MALFORMED_FINAL_TAIL", byte_length: Buffer.byteLength(tailText, "utf8"), code: errorCode(error), message: error.message };
    }
  }
  return { events, tail, has_trailing_newline: hasTrailingNewline, byte_length: bytes.length, valid_prefix_bytes: hasTrailingNewline ? bytes.length : Buffer.byteLength(text.slice(0, text.length - tailText.length), "utf8") };
}

export async function readJournal(root, { sourcing_id = null } = {}) {
  const paths = pathsFor(root);
  let bytes = Buffer.alloc(0);
  try { bytes = await fs.readFile(paths.journal); } catch (error) { if (error.code !== "ENOENT") throw error; }
  const parsed = parseJournalBytes(bytes, sourcing_id);
  let checkpoint = null;
  let checkpoint_error = null;
  try {
    checkpoint = JSON.parse(await fs.readFile(paths.checkpoint, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") checkpoint_error = { code: errorCode(error), message: error.message };
  }
  return Object.freeze({ ...parsed, checkpoint, checkpoint_error, raw_bytes: bytes });
}

function checkpointPayload(value) {
  return {
    checkpoint_schema_version: R6_VERSIONS.checkpoint,
    sourcing_id: value.sourcing_id,
    expected_event_count: value.expected_event_count,
    expected_head_event_digest: value.expected_head_event_digest,
    expected_state_digest: value.expected_state_digest,
    generation: value.generation,
    checkpoint_id: value.checkpoint_id,
  };
}

export function makeCheckpoint({ sourcing_id, expected_event_count, expected_head_event_digest, expected_state_digest, generation }) {
  assertSafeSourcingId(sourcing_id);
  if (!Number.isSafeInteger(expected_event_count) || expected_event_count < 0) fail("INVALID_CHECKPOINT_COUNT", "checkpoint event count is invalid");
  assertDigest(expected_head_event_digest, "expected_head_event_digest");
  assertDigest(expected_state_digest, "expected_state_digest");
  if (!Number.isSafeInteger(generation) || generation < 1) fail("INVALID_CHECKPOINT_GENERATION", "checkpoint generation is invalid");
  const checkpoint_id = `r6-checkpoint-${sha256Canonical({ sourcing_id, expected_event_count, expected_head_event_digest, expected_state_digest, generation })}`;
  const value = checkpointPayload({ sourcing_id, expected_event_count, expected_head_event_digest, expected_state_digest, generation, checkpoint_id });
  return Object.freeze({ ...value, checkpoint_digest: sha256Canonical({ ...value, checkpoint_digest: null }) });
}

export function validateCheckpoint(checkpoint, { sourcing_id = null } = {}) {
  const expectedKeys = ["checkpoint_schema_version", "sourcing_id", "expected_event_count", "expected_head_event_digest", "expected_state_digest", "generation", "checkpoint_id", "checkpoint_digest"];
  if (!checkpoint || typeof checkpoint !== "object" || Object.keys(checkpoint).some((key) => !expectedKeys.includes(key)) || expectedKeys.some((key) => !Object.hasOwn(checkpoint, key))) fail("CHECKPOINT_SCHEMA_ERROR", "checkpoint has an invalid shape");
  if (checkpoint.checkpoint_schema_version !== R6_VERSIONS.checkpoint) fail("CHECKPOINT_SCHEMA_ERROR", "checkpoint schema version is unsupported");
  assertSafeSourcingId(checkpoint.sourcing_id);
  if (sourcing_id !== null && checkpoint.sourcing_id !== sourcing_id) fail("SOURCING_ID_MISMATCH", "checkpoint belongs to another sourcing aggregate");
  if (!Number.isSafeInteger(checkpoint.expected_event_count) || checkpoint.expected_event_count < 0) fail("CHECKPOINT_SCHEMA_ERROR", "checkpoint count is invalid");
  assertDigest(checkpoint.expected_head_event_digest, "checkpoint.expected_head_event_digest");
  assertDigest(checkpoint.expected_state_digest, "checkpoint.expected_state_digest");
  if (!Number.isSafeInteger(checkpoint.generation) || checkpoint.generation < 1) fail("CHECKPOINT_SCHEMA_ERROR", "checkpoint generation is invalid");
  if (typeof checkpoint.checkpoint_id !== "string" || typeof checkpoint.checkpoint_digest !== "string") fail("CHECKPOINT_SCHEMA_ERROR", "checkpoint identity is invalid");
  const expected = sha256Canonical({ ...checkpoint, checkpoint_digest: null });
  if (expected !== checkpoint.checkpoint_digest) fail("CHECKPOINT_DIGEST_MISMATCH", "checkpoint digest mismatch");
  return true;
}

async function replaceCheckpoint(paths, checkpoint) {
  const temporary = `${paths.checkpoint}.${process.pid}.${randomUUID()}.tmp`;
  const handle = await fs.open(temporary, "wx");
  try {
    await handle.writeFile(`${canonicalize(checkpoint)}\n`, "utf8");
    await flush(handle);
  } finally {
    await handle.close();
  }
  try {
    await fs.rename(temporary, paths.checkpoint);
  } catch (error) {
    // Node's Windows rename cannot replace an existing file. The fallback is
    // confined to the checkpoint file; the journal remains append-only and a
    // crash is reported as lag/ahead rather than silently trusted.
    if (error.code === "EEXIST" || error.code === "EPERM" || error.code === "ENOTEMPTY") {
      await fs.rm(paths.checkpoint, { force: true });
      await fs.rename(temporary, paths.checkpoint);
    } else {
      await fs.rm(temporary, { force: true });
      throw error;
    }
  }
}

async function writeCheckpoint(root, checkpoint) {
  const paths = pathsFor(root);
  validateCheckpoint(checkpoint, { sourcing_id: checkpoint.sourcing_id });
  await replaceCheckpoint(paths, checkpoint);
}

export async function initializeJournal(root, sourcing_id, { clock = () => new Date().toISOString() } = {}) {
  assertSafeSourcingId(sourcing_id);
  const paths = pathsFor(root);
  await fs.mkdir(paths.root, { recursive: true });
  await fs.mkdir(join(paths.root, "artifacts"), { recursive: true });
  const release = await acquireLock(paths.root);
  try {
    const hasJournal = await exists(paths.journal);
    const hasCheckpoint = await exists(paths.checkpoint);
    if (hasJournal || hasCheckpoint) {
      const document = await readJournal(paths.root, { sourcing_id });
      if (document.checkpoint) validateCheckpoint(document.checkpoint, { sourcing_id });
      if (document.events.length || document.tail) return Object.freeze({ root: paths.root, sourcing_id, initialized: false });
    }
    if (!hasJournal) {
      const handle = await fs.open(paths.journal, "wx");
      await flush(handle);
      await handle.close();
    }
    const state = createEmptyState(sourcing_id);
    const checkpoint = makeCheckpoint({
      sourcing_id,
      expected_event_count: 0,
      expected_head_event_digest: genesisDigest(sourcing_id),
      expected_state_digest: state.state_digest,
      generation: 1,
    });
    await writeCheckpoint(paths.root, checkpoint);
    return Object.freeze({ root: paths.root, sourcing_id, initialized: true, checkpoint, clock_name: clock.name || "clock" });
  } finally {
    await release();
  }
}

export async function openJournal(root, { sourcing_id = null } = {}) {
  const paths = pathsFor(root);
  const document = await readJournal(paths.root, { sourcing_id });
  if (!document.checkpoint && !document.events.length && !document.tail) fail("JOURNAL_NOT_INITIALIZED", "journal has no checkpoint or events");
  const resolved = sourcing_id ?? document.checkpoint?.sourcing_id ?? document.events[0]?.sourcing_id ?? null;
  if (resolved === null) fail("SOURCING_ID_REQUIRED", "cannot infer sourcing_id from empty journal");
  assertSafeSourcingId(resolved);
  if (document.checkpoint) validateCheckpoint(document.checkpoint, { sourcing_id: resolved });
  return Object.freeze({ root: paths.root, sourcing_id: resolved });
}

function assertEventMatchesArtifact(event, artifact) {
  const ref = event.artifact_refs[0];
  if (!ref) fail("ARTIFACT_SET_MISMATCH", "event has no artifact reference");
  const p = event.payload;
  switch (event.event_type) {
    case "MANIFEST_FROZEN":
    case "MANIFEST_REVISED": {
      if (artifact?.type !== "FROZEN_MANIFEST" || artifact.manifest_digest !== p.manifest_digest || artifact.manifest_identity !== p.manifest_identity || artifact.manifest.manifest_revision !== p.manifest_revision || artifact.manifest.sourcing_id !== event.sourcing_id) fail("ARTIFACT_EVENT_MISMATCH", "manifest event does not match its R3 artifact");
      const ids = artifact.manifest.supplier_roster.map((item) => item.supplier_id).sort((a, b) => a.localeCompare(b));
      if (canonicalize(ids) !== canonicalize(p.supplier_ids)) fail("ARTIFACT_EVENT_MISMATCH", "manifest supplier roster does not match event payload");
      if (event.event_type === "MANIFEST_REVISED" && artifact.predecessor_manifest_digest !== p.predecessor_manifest_digest) fail("ARTIFACT_EVENT_MISMATCH", "manifest predecessor does not match event");
      break;
    }
    case "ROUND_OPENED":
    case "ROUND_CLOSED": {
      if (artifact?.sourcing_id !== event.sourcing_id || artifact.round_id !== p.round_id || artifact.round_type !== p.round_type || artifact.manifest_revision !== p.manifest_revision || artifact.manifest_digest !== p.manifest_digest) fail("ARTIFACT_EVENT_MISMATCH", "round event does not match its R3 artifact");
      if (event.event_type === "ROUND_OPENED" && artifact.status !== p.status) fail("ARTIFACT_EVENT_MISMATCH", "open event status does not match artifact");
      if (event.event_type === "ROUND_CLOSED" && (artifact.status !== p.status || artifact.state_digest !== p.state_digest)) fail("ARTIFACT_EVENT_MISMATCH", "close event state does not match artifact");
      const ids = artifact.lanes.map((item) => item.supplier_id).sort((a, b) => a.localeCompare(b));
      if (canonicalize(ids) !== canonicalize(p.supplier_ids ?? ids)) fail("ARTIFACT_EVENT_MISMATCH", "round supplier set does not match event");
      break;
    }
    case "ELIGIBILITY_FROZEN":
      if (artifact?.sourcing_id !== event.sourcing_id || artifact?.state_digest !== p.state_digest || artifact?.eligibility?.eligibility_digest !== p.eligibility_digest || canonicalize(artifact.eligibility.eligible_supplier_ids) !== canonicalize(p.eligible_supplier_ids)) fail("ARTIFACT_EVENT_MISMATCH", "eligibility event does not match R3 artifact");
      if (artifact.round_id !== p.round_id) fail("ARTIFACT_EVENT_MISMATCH", "eligibility artifact is for another round");
      break;
    case "SOURCE_OBSERVED":
      if (artifact?.source_snapshot_digest !== p.source_snapshot_digest || artifact.mailbox_id !== p.mailbox_id || artifact.email_id !== p.email_id || artifact.content_state !== p.content_state) fail("ARTIFACT_EVENT_MISMATCH", "source event does not match R4 snapshot");
      break;
    case "EVIDENCE_STATE_RECORDED":
      if (artifact?.evidence_id !== p.evidence_id || (artifact.source_snapshot_digest ?? artifact.receipt_snapshot_digest) !== p.source_snapshot_digest || artifact.supplier_id !== p.supplier_id || artifact.field_name !== p.field_name || artifact.verification_state !== p.verification_state) fail("ARTIFACT_EVENT_MISMATCH", "evidence event does not match R4/R4R evidence");
      if (artifact.sourcing_id !== event.sourcing_id || artifact.round_id !== p.round_id) fail("ARTIFACT_EVENT_MISMATCH", "evidence artifact ancestry does not match event");
      break;
    case "LANE_PACKET_COMPILED":
      if (artifact?.packet_digest !== p.packet_digest || artifact.supplier_id !== p.supplier_id || artifact.lane_id !== p.lane_id || artifact.round_id !== p.round_id || artifact.sourcing_id !== event.sourcing_id) fail("ARTIFACT_EVENT_MISMATCH", "lane packet event does not match R5 packet");
      break;
    case "LANE_RESULT_DECLASSIFIED":
      if (artifact?.declassification_digest !== p.declassification_digest || artifact.supplier_id !== p.supplier_id || artifact.lane_id !== p.lane_id) fail("ARTIFACT_EVENT_MISMATCH", "lane result event does not match R5 result");
      break;
    default: fail("UNKNOWN_EVENT_TYPE", `cannot match artifact for ${event.event_type}`);
  }
}

async function validateCommandArtifacts(root, command) {
  const refs = command.artifact_refs;
  for (const ref of refs) {
    const checked = await verifyArtifactReference(root, ref);
    if (!checked.exists) fail("ARTIFACT_MISSING", `artifact ${ref.digest} is not present`, { digest: ref.digest });
    await validateArtifactForReference(root, ref);
  }
  const ref = refs[0];
  if (ref.artifact_type !== "R5_RAW_WORKER_OUTPUT") {
    const artifact = await readJsonArtifact(root, ref.digest);
    const placeholder = {
      event_schema_version: R6_VERSIONS.event,
      sourcing_id: command.sourcing_id,
      sequence: 1,
      event_id: "placeholder",
      command_id: command.command_id,
      event_type: command.event_type,
      authority_class: eventAuthority(command.event_type),
      payload: command.payload,
      payload_digest: sha256Canonical(command.payload),
      artifact_refs: command.artifact_refs,
      previous_event_digest: genesisDigest(command.sourcing_id),
      event_digest: "0".repeat(64),
      recorded_at: "2026-01-01T00:00:00.000Z",
      producer: { name: "r6-journal", version: R6_VERSIONS.producer },
    };
    assertEventMatchesArtifact(placeholder, artifact);
  }
}

export async function validateStoredEventArtifacts(root, event) {
  for (const ref of event.artifact_refs) {
    const checked = await verifyArtifactReference(root, ref);
    if (!checked.exists) fail("ARTIFACT_MISSING", `artifact ${ref.digest} is not present`, { digest: ref.digest });
    await validateArtifactForReference(root, ref);
  }
  if (event.artifact_refs[0]?.artifact_type === "R5_RAW_WORKER_OUTPUT") return true;
  const artifact = await readJsonArtifact(root, event.artifact_refs[0].digest);
  assertEventMatchesArtifact(event, artifact);
  return true;
}

function eventAuthority(eventType) {
  const authorities = {
    MANIFEST_FROZEN: "BUYER_CONTROL",
    MANIFEST_REVISED: "BUYER_CONTROL",
    ROUND_OPENED: "BUYER_CONTROL",
    ROUND_CLOSED: "SYSTEM_DERIVED",
    ELIGIBILITY_FROZEN: "SYSTEM_DERIVED",
    SOURCE_OBSERVED: "SUPPLIER_EVIDENCE",
    EVIDENCE_STATE_RECORDED: "SYSTEM_DERIVED",
    LANE_PACKET_COMPILED: "SYSTEM_DERIVED",
    LANE_RESULT_DECLASSIFIED: "SYSTEM_DERIVED",
  };
  if (!authorities[eventType]) fail("UNKNOWN_EVENT_TYPE", `unknown event type ${eventType}`);
  return authorities[eventType];
}

function semanticDigestFromEvent(event) {
  return sha256Canonical({
    sourcing_id: event.sourcing_id,
    command_id: event.command_id,
    event_type: event.event_type,
    payload: event.payload,
    artifact_refs: event.artifact_refs,
  });
}

function findCommand(events, command_id) {
  return events.find((event) => event.command_id === command_id) ?? null;
}

function receiptFor(event, { duplicate = false } = {}) {
  return Object.freeze({
    outcome: duplicate ? "DUPLICATE_COMMAND_REPLAY" : "EVENT_ACCEPTED",
    command_id: event.command_id,
    event_id: event.event_id,
    event_digest: event.event_digest,
    sequence: event.sequence,
    sourcing_id: event.sourcing_id,
    duplicate,
  });
}

async function currentDocument(root, sourcing_id) {
  const document = await readJournal(root, { sourcing_id });
  if (document.checkpoint) validateCheckpoint(document.checkpoint, { sourcing_id });
  if (document.checkpoint_error) fail("CHECKPOINT_PARSE_ERROR", document.checkpoint_error.message);
  if (document.tail) fail(document.tail.kind === "MALFORMED_FINAL_TAIL" ? "RECOVERABLE_TORN_TAIL" : "RECOVERABLE_TORN_TAIL", "journal has an incomplete final line", { tail: document.tail });
  const state = reduceEvents(document.events, { sourcing_id });
  // A writer may only build a new checkpoint from a history whose already
  // referenced artifacts still validate. Otherwise a missing/tampered prior
  // artifact could be hidden by a later checkpoint advance.
  for (const event of document.events) await validateStoredEventArtifacts(pathsFor(root).root, event);
  return { ...document, state };
}

function assertCheckpointAllowsWriter(document, state) {
  const checkpoint = document.checkpoint;
  if (!checkpoint) return;
  const count = state.journal.event_count;
  if (checkpoint.expected_event_count > count) fail("JOURNAL_BEHIND_CHECKPOINT", "checkpoint claims events that are absent from the journal");
  const prefix = reduceEvents(document.events.slice(0, checkpoint.expected_event_count), { sourcing_id: state.sourcing_id });
  if (prefix.journal.head_event_digest !== checkpoint.expected_head_event_digest || prefix.state_digest !== checkpoint.expected_state_digest) fail("JOURNAL_BEHIND_CHECKPOINT", "checkpoint does not match a valid journal prefix");
}

export async function appendCommand(root, rawCommand, {
  clock = () => new Date().toISOString(),
  failpoint = null,
  lock_timeout_ms = 5_000,
} = {}) {
  const command = validateCommand(rawCommand);
  const paths = pathsFor(root);
  assertSafeSourcingId(command.sourcing_id);
  await fs.mkdir(paths.root, { recursive: true });
  await fs.mkdir(join(paths.root, "artifacts"), { recursive: true });
  const release = await acquireLock(paths.root, { timeout_ms: lock_timeout_ms });
  try {
    const document = await currentDocument(paths.root, command.sourcing_id);
    assertCheckpointAllowsWriter(document, document.state);
    const existing = findCommand(document.events, command.command_id);
    if (existing) {
      if (semanticDigestFromEvent(existing) !== commandSemanticDigest(command)) fail("COMMAND_REPLAY_CONFLICT", "command ID was already used with a different semantic mutation");
      return receiptFor(existing, { duplicate: true });
    }
    const currentHead = document.events.at(-1)?.event_digest ?? genesisDigest(command.sourcing_id);
    if (command.expected_head_event_digest !== null && command.expected_head_event_digest !== currentHead) fail("STALE_HEAD", "caller expected a different journal head", { expected: command.expected_head_event_digest, actual: currentHead });
    await validateCommandArtifacts(paths.root, command);
    const recordedAt = clock();
    if (!UTC_RE.test(recordedAt)) fail("INVALID_RECORDED_AT", "journal clock must return an ISO UTC millisecond timestamp");
    const event = buildEvent(command, {
      sequence: document.events.length + 1,
      previous_event_digest: currentHead,
      recorded_at: recordedAt,
    });
    reduceEvents([...document.events, event], { sourcing_id: command.sourcing_id });
    crashFailpoint(failpoint === "BEFORE_EVENT_APPEND" ? failpoint : null);
    const handle = await fs.open(paths.journal, "a");
    try {
      const line = Buffer.from(canonicalLine(event), "utf8");
      if (failpoint === "PARTIAL_EVENT_WRITE") {
        const half = Math.max(1, Math.floor(line.length / 2));
        await handle.write(line.subarray(0, half));
        await flush(handle);
        crashFailpoint(failpoint);
      }
      await handle.write(line);
      if (failpoint === "AFTER_EVENT_WRITE") crashFailpoint(failpoint);
      await flush(handle);
    } finally {
      await handle.close();
    }
    if (failpoint === "AFTER_JOURNAL_FSYNC_BEFORE_CHECKPOINT") crashFailpoint(failpoint);
    const nextState = reduceEvents([...document.events, event], { sourcing_id: command.sourcing_id });
    const oldGeneration = document.checkpoint?.generation ?? 0;
    const checkpoint = makeCheckpoint({
      sourcing_id: command.sourcing_id,
      expected_event_count: nextState.journal.event_count,
      expected_head_event_digest: nextState.journal.head_event_digest,
      expected_state_digest: nextState.state_digest,
      generation: oldGeneration + 1,
    });
    await writeCheckpoint(paths.root, checkpoint);
    if (failpoint === "AFTER_CHECKPOINT_BEFORE_RETURN") crashFailpoint(failpoint);
    return receiptFor(event);
  } finally {
    await release();
  }
}

export async function repairTornTail(root, { sourcing_id = null } = {}) {
  const paths = pathsFor(root);
  const document = await readJournal(paths.root, { sourcing_id });
  if (!document.tail || document.tail.kind !== "MALFORMED_FINAL_TAIL") fail("NOT_REPAIRABLE_TAIL", "journal does not have a malformed final tail");
  const checkpoint = document.checkpoint;
  if (!checkpoint) fail("NO_CHECKPOINT_FOR_TAIL", "tail cannot be repaired without a checkpoint");
  validateCheckpoint(checkpoint, { sourcing_id: sourcing_id ?? checkpoint.sourcing_id });
  const prefixState = reduceEvents(document.events, { sourcing_id: sourcing_id ?? checkpoint.sourcing_id });
  if (checkpoint.expected_event_count !== prefixState.journal.event_count || checkpoint.expected_head_event_digest !== prefixState.journal.head_event_digest || checkpoint.expected_state_digest !== prefixState.state_digest) fail("TAIL_COMMITMENT_MISMATCH", "checkpoint does not prove the malformed tail is uncommitted");
  const newline = document.raw_bytes.lastIndexOf(0x0a);
  const retainedBytes = newline < 0 ? 0 : newline + 1;
  if (newline < 0 && prefixState.journal.event_count !== 0) fail("TAIL_REPAIR_UNSAFE", "there is no complete newline-delimited prefix");
  await fs.truncate(paths.journal, retainedBytes);
  return Object.freeze({ repaired: true, removed_bytes: document.raw_bytes.length - retainedBytes, retained_event_count: prefixState.journal.event_count });
}

export async function advanceCheckpoint(root, { sourcing_id = null } = {}) {
  const paths = pathsFor(root);
  const release = await acquireLock(paths.root);
  try {
    const document = await currentDocument(paths.root, sourcing_id ?? undefined);
    const currentState = document.state;
    assertCheckpointAllowsWriter(document, currentState);
    const currentHead = currentState.journal.head_event_digest;
    if (document.checkpoint && document.checkpoint.expected_event_count === currentState.journal.event_count && document.checkpoint.expected_head_event_digest === currentHead && document.checkpoint.expected_state_digest === currentState.state_digest) {
      return Object.freeze({ advanced: false, checkpoint: document.checkpoint });
    }
    const checkpoint = makeCheckpoint({
      sourcing_id: currentState.sourcing_id,
      expected_event_count: currentState.journal.event_count,
      expected_head_event_digest: currentHead,
      expected_state_digest: currentState.state_digest,
      generation: (document.checkpoint?.generation ?? 0) + 1,
    });
    await writeCheckpoint(paths.root, checkpoint);
    return Object.freeze({ advanced: true, checkpoint });
  } finally {
    await release();
  }
}

export async function readOnlyState(root, { sourcing_id = null } = {}) {
  const document = await currentDocument(root, sourcing_id ?? undefined);
  return Object.freeze({ state: document.state, events: document.events, checkpoint: document.checkpoint });
}

// Research-only hook used to terminate a real lock-holder process in the R6
// test suite. It does not append, repair, or mutate journal contents.
export async function holdJournalLockForResearch(root, { ready_path = null, duration_ms = 60_000 } = {}) {
  const release = await acquireLock(root);
  try {
    if (ready_path) await fs.writeFile(resolve(ready_path), JSON.stringify({ pid: process.pid, held: true }), "utf8");
    await new Promise((resolvePromise) => setTimeout(resolvePromise, duration_ms));
  } finally {
    await release();
  }
}

export const r6JournalContract = Object.freeze({
  files: Object.freeze({ journal: JOURNAL_FILE, checkpoint: CHECKPOINT_FILE, lock: LOCK_FILE }),
  append_order: ["validate_command", "validate_artifacts", "build_event", "append_complete_jsonl_line", "flush/fsync", "checkpoint_atomic_replace", "return_receipt"],
  sequence_authority: "journal writer assigns contiguous sequence under aggregate lock",
  command_identity: "command_id is idempotency identity; semantic mutation is compared on replay",
  machine_loss_claim: "none; local files only",
  checkpoint_role: "expected-head completeness aid, not external transparency witness",
});
