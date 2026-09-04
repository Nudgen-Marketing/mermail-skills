import { promises as fs } from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { R8_VERSION, JOURNAL_VERSION, EFFECT_STATES, clone, digest, exactKeys, fail, freeze, isPlainObject, requiredKeys, sha256Canonical, string } from "./core.mjs";

export const COMMAND_TYPES = Object.freeze([
  "EFFECT_INTENT_CREATED",
  "EFFECT_PREVIEWED",
  "EFFECT_APPROVED",
  "EFFECT_DISPATCH_RESERVED",
  "EFFECT_RESULT_RECORDED",
  "EFFECT_OBSERVATION_RECORDED",
]);

export const EVENT_TYPES = Object.freeze([
  "EFFECT_INTENT_CREATED",
  "EFFECT_PREVIEWED",
  "EFFECT_APPROVED",
  "EFFECT_DISPATCH_RESERVED",
  "EFFECT_PREEXECUTION_REJECTED",
  "EFFECT_MUTATION_ACCEPTED",
  "EFFECT_AMBIGUOUS",
  "EFFECT_OBSERVATION_RECORDED",
  "EFFECT_RECONCILIATION_CONFLICT",
]);

const COMMAND_KEYS = ["command_schema_version", "sourcing_id", "command_id", "command_type", "effect_id", "payload", "artifact_refs", "expected_head_event_digest"];
const EVENT_KEYS = ["event_schema_version", "sourcing_id", "sequence", "event_id", "command_id", "event_type", "effect_id", "payload", "artifact_refs", "previous_event_digest", "event_digest", "recorded_at"];
const REF_KEYS = ["digest", "artifact_type"];
const DIGEST_RE = /^[a-f0-9]{64}$/u;
const ARTIFACT_TYPES = Object.freeze(["EFFECT_INTENT", "EFFECT_REQUEST", "EFFECT_PREVIEW", "EFFECT_APPROVAL_CANDIDATE", "EFFECT_APPROVAL", "EFFECT_RAW_RESULT", "EFFECT_OBSERVATION"]);

function pathsFor(root) {
  const base = resolve(root);
  return Object.freeze({ root: base, journal: join(base, "effects.jsonl"), checkpoint: join(base, "effects.head.json"), lock: join(base, ".effects.lock"), artifacts: join(base, "artifacts") });
}

function validateRef(ref, path = "artifact_ref") {
  exactKeys(ref, REF_KEYS, path);
  requiredKeys(ref, REF_KEYS, path);
  digest(ref.digest, `${path}.digest`);
  if (!ARTIFACT_TYPES.includes(ref.artifact_type)) fail("UNKNOWN_ARTIFACT_TYPE", `${path}.artifact_type is not supported`);
  return { digest: ref.digest, artifact_type: ref.artifact_type };
}

function normalizeRefs(refs) {
  if (!Array.isArray(refs) || refs.length > 4) fail("INVALID_ARTIFACT_REFS", "artifact_refs must be a bounded array");
  const result = refs.map((ref, index) => validateRef(ref, `artifact_refs[${index}]`)).sort((a, b) => `${a.artifact_type}:${a.digest}`.localeCompare(`${b.artifact_type}:${b.digest}`));
  const keys = result.map((ref) => `${ref.artifact_type}:${ref.digest}`);
  if (new Set(keys).size !== keys.length) fail("DUPLICATE_ARTIFACT_REF", "artifact_refs contains duplicates");
  return result;
}

export function journalPaths(root) { return pathsFor(root); }

export async function putArtifact(root, value, artifact_type) {
  if (!ARTIFACT_TYPES.includes(artifact_type)) fail("UNKNOWN_ARTIFACT_TYPE", "artifact type is not supported");
  const bytes = Buffer.from(JSON.stringify(value), "utf8");
  const artifactDigest = sha256Canonical(value);
  const paths = pathsFor(root);
  await fs.mkdir(paths.artifacts, { recursive: true });
  const target = join(paths.artifacts, `${artifactDigest}.json`);
  try {
    await fs.access(target);
  } catch {
    const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
    await fs.writeFile(temporary, bytes, { flag: "wx" });
    await fs.rename(temporary, target);
  }
  return Object.freeze({ digest: artifactDigest, artifact_type });
}

async function readArtifact(root, ref) {
  const checked = validateRef(ref);
  let bytes;
  try { bytes = await fs.readFile(join(pathsFor(root).artifacts, `${checked.digest}.json`)); }
  catch (error) { if (error.code === "ENOENT") fail("ARTIFACT_MISSING", "effect artifact referenced by durable history is missing", { digest: checked.digest, artifact_type: checked.artifact_type }); throw error; }
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); } catch { fail("ARTIFACT_NOT_JSON", "effect artifact is not JSON"); }
  if (sha256Canonical(value) !== checked.digest) fail("ARTIFACT_DIGEST_MISMATCH", "effect artifact bytes do not match its content digest");
  return value;
}

async function assertArtifacts(root, refs) {
  for (const ref of refs) await readArtifact(root, ref);
}

function validateCommand(command) {
  exactKeys(command, COMMAND_KEYS, "command");
  requiredKeys(command, COMMAND_KEYS, "command");
  if (command.command_schema_version !== `${R8_VERSION}.command`) fail("COMMAND_VERSION", "unsupported R8 command version");
  string(command.sourcing_id, "command.sourcing_id", { max: 256 });
  string(command.command_id, "command.command_id", { max: 256 });
  if (!COMMAND_TYPES.includes(command.command_type)) fail("UNKNOWN_COMMAND", "command type is not a registered R8 command");
  string(command.effect_id, "command.effect_id", { max: 256 });
  if (!isPlainObject(command.payload)) fail("INVALID_COMMAND_PAYLOAD", "command payload must be an object");
  if (!Array.isArray(command.artifact_refs)) fail("INVALID_ARTIFACT_REFS", "command artifact_refs must be an array");
  const refs = normalizeRefs(command.artifact_refs);
  if (command.expected_head_event_digest !== null && (!DIGEST_RE.test(command.expected_head_event_digest))) fail("INVALID_HEAD", "expected head must be a digest or null");
  return { ...clone(command), artifact_refs: refs };
}

function eventDigest(event) {
  return sha256Canonical({
    event_schema_version: event.event_schema_version,
    sourcing_id: event.sourcing_id,
    sequence: event.sequence,
    event_id: event.event_id,
    command_id: event.command_id,
    event_type: event.event_type,
    effect_id: event.effect_id,
    payload: event.payload,
    artifact_refs: event.artifact_refs,
    previous_event_digest: event.previous_event_digest,
    recorded_at: event.recorded_at,
  });
}

function validateEvent(event, expectedSourcingId = null, expectedPrevious = null, expectedSequence = null) {
  exactKeys(event, EVENT_KEYS, "event");
  requiredKeys(event, EVENT_KEYS, "event");
  if (event.event_schema_version !== JOURNAL_VERSION) fail("EVENT_VERSION", "unsupported R8 event version");
  string(event.sourcing_id, "event.sourcing_id", { max: 256 });
  if (expectedSourcingId !== null && event.sourcing_id !== expectedSourcingId) fail("SOURCING_MISMATCH", "event sourcing ID mismatch");
  if (!Number.isSafeInteger(event.sequence) || event.sequence < 1 || (expectedSequence !== null && event.sequence !== expectedSequence)) fail("SEQUENCE_ERROR", "event sequence is not contiguous");
  string(event.event_id, "event.event_id", { max: 256 });
  string(event.command_id, "event.command_id", { max: 256 });
  if (!EVENT_TYPES.includes(event.event_type)) fail("UNKNOWN_EVENT_TYPE", "event type is not registered");
  string(event.effect_id, "event.effect_id", { max: 256 });
  if (!isPlainObject(event.payload)) fail("INVALID_EVENT_PAYLOAD", "event payload must be an object");
  normalizeRefs(event.artifact_refs);
  if (expectedPrevious !== null && event.previous_event_digest !== expectedPrevious) fail("CHAIN_LINK_MISMATCH", "event previous digest mismatch");
  if (!DIGEST_RE.test(event.previous_event_digest)) fail("INVALID_PREVIOUS_DIGEST", "event previous digest is invalid");
  string(event.recorded_at, "event.recorded_at", { max: 40 });
  if (event.event_digest !== eventDigest(event)) fail("EVENT_DIGEST_MISMATCH", "event digest mismatch");
  return true;
}

function genesis(sourcingId) { return sha256Canonical({ r8_genesis: true, sourcing_id: sourcingId }); }

function initialState(sourcingId) {
  return { state_schema_version: `${R8_VERSION}.state`, sourcing_id: sourcingId, event_count: 0, head_event_digest: genesis(sourcingId), effects: {}, command_receipts: {}, state_digest: null };
}

function stateDigest(state) {
  const copy = clone(state);
  copy.state_digest = null;
  return sha256Canonical(copy);
}

function effectOrFail(state, effectId) {
  const effect = state.effects[effectId];
  if (!effect) fail("EFFECT_NOT_FOUND", "effect does not exist");
  return effect;
}

function applyEvent(state, event) {
  const next = clone(state);
  const p = event.payload;
  if (event.event_type === "EFFECT_INTENT_CREATED") {
    if (next.effects[event.effect_id]) fail("DUPLICATE_EFFECT", "effect intent already exists");
    next.effects[event.effect_id] = { effect_id: event.effect_id, state: "NOT_AUTHORIZED", intent_digest: p.intent_digest, current_state_digest: p.current_state_digest, request_digest: p.request_digest, preview_digest: null, approval_candidate_digest: null, approval_digest: null, reservation_count: 0, attempt_count: 0, observations: [], terminal_result: null };
  } else {
    const effect = effectOrFail(next, event.effect_id);
    if (event.event_type === "EFFECT_PREVIEWED") {
      if (effect.state !== "NOT_AUTHORIZED" || effect.intent_digest !== p.intent_digest) fail("INVALID_PREVIEW_TRANSITION", "preview is not the next valid effect transition");
      effect.preview_digest = p.preview_digest;
      effect.state = "PREVIEWED";
    } else if (event.event_type === "EFFECT_APPROVED") {
      if (effect.state !== "PREVIEWED" || effect.preview_digest !== p.preview_digest) fail("INVALID_APPROVAL_TRANSITION", "approval is not bound to current preview");
      digest(p.approval_candidate_digest, "approval_candidate_digest");
      effect.approval_digest = p.approval_digest;
      effect.approval_candidate_digest = p.approval_candidate_digest;
      effect.state = "APPROVED";
    } else if (event.event_type === "EFFECT_DISPATCH_RESERVED") {
      if (effect.state !== "APPROVED") fail("DISPATCH_NOT_APPROVED", "dispatch requires current approval");
      if (effect.reservation_count !== 0) fail("DISPATCH_ALREADY_RESERVED", "effect already has a dispatch reservation");
      digest(p.approval_candidate_digest, "approval_candidate_digest");
      if (effect.approval_digest !== p.approval_digest || effect.approval_candidate_digest !== p.approval_candidate_digest || effect.request_digest !== p.request_digest) fail("RESERVATION_BINDING", "dispatch is not bound to approval candidate/record/request");
      effect.reservation_count += 1;
      effect.attempt_count += 1;
      effect.state = "DISPATCH_RESERVED";
    } else if (event.event_type === "EFFECT_PREEXECUTION_REJECTED" || event.event_type === "EFFECT_MUTATION_ACCEPTED" || event.event_type === "EFFECT_AMBIGUOUS") {
      if (effect.state !== "DISPATCH_RESERVED") fail("INVALID_RESULT_TRANSITION", "result requires a dispatch reservation");
      effect.terminal_result = { state: event.event_type === "EFFECT_PREEXECUTION_REJECTED" ? "PRE_EXECUTION_REJECTED" : event.event_type === "EFFECT_MUTATION_ACCEPTED" ? "MUTATION_ACCEPTED" : "AMBIGUOUS", reason: p.reason ?? null, mutation_id: p.mutation_id ?? null };
      effect.state = effect.terminal_result.state;
    } else if (event.event_type === "EFFECT_OBSERVATION_RECORDED" || event.event_type === "EFFECT_RECONCILIATION_CONFLICT") {
      if (!["DISPATCH_RESERVED", "PRE_EXECUTION_REJECTED", "MUTATION_ACCEPTED", "AMBIGUOUS", "OBSERVED_PROVIDER_DELIVERED", "OBSERVED_IN_RECIPIENT_MAILBOX", "RECONCILIATION_CONFLICT"].includes(effect.state)) fail("INVALID_OBSERVATION_TRANSITION", "observation is not valid for current effect");
      effect.observations.push({ reconciliation_digest: p.reconciliation_digest, outcome: p.outcome, logical_effect_count: p.logical_effect_count });
      if (event.event_type === "EFFECT_RECONCILIATION_CONFLICT" || p.outcome === "MULTIPLE_MATCHING_EFFECTS") effect.state = "RECONCILIATION_CONFLICT";
      else if (p.state === "OBSERVED_IN_RECIPIENT_MAILBOX") effect.state = "OBSERVED_IN_RECIPIENT_MAILBOX";
      else if (p.state === "OBSERVED_PROVIDER_DELIVERED") effect.state = "OBSERVED_PROVIDER_DELIVERED";
    }
  }
  next.event_count = event.sequence;
  next.head_event_digest = event.event_digest;
  next.command_receipts[event.command_id] = { command_id: event.command_id, event_id: event.event_id, event_digest: event.event_digest, sequence: event.sequence };
  next.state_digest = stateDigest(next);
  return next;
}

export function reduceEvents(events, { sourcing_id = null } = {}) {
  if (!Array.isArray(events)) fail("INVALID_EVENTS", "events must be an array");
  const sid = sourcing_id ?? events[0]?.sourcing_id;
  if (!sid) fail("MISSING_SOURCING_ID", "sourcing ID is required");
  let state = initialState(sid);
  let previous = genesis(sid);
  for (const [index, event] of events.entries()) {
    validateEvent(event, sid, previous, index + 1);
    state = applyEvent(state, event);
    previous = event.event_digest;
  }
  state.state_digest = stateDigest(state);
  return freeze(state);
}

async function loadEvents(root, sourcingId) {
  const paths = pathsFor(root);
  let bytes = Buffer.alloc(0);
  try { bytes = await fs.readFile(paths.journal); } catch (error) { if (error.code !== "ENOENT") throw error; }
  if (bytes.length === 0) return [];
  const text = bytes.toString("utf8");
  if (!text.endsWith("\n")) fail("TORN_TAIL", "R8 journal has an incomplete final line");
  return text.trimEnd().split("\n").map((line) => JSON.parse(line));
}

async function loadCheckpoint(root) {
  try { return JSON.parse(await fs.readFile(pathsFor(root).checkpoint, "utf8")); } catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

function checkpointFor(state) {
  const body = { checkpoint_schema_version: `${R8_VERSION}.checkpoint`, sourcing_id: state.sourcing_id, expected_event_count: state.event_count, expected_head_event_digest: state.head_event_digest, expected_state_digest: state.state_digest };
  return { ...body, checkpoint_digest: sha256Canonical(body) };
}

async function lock(root) {
  const path = pathsFor(root).lock;
  try {
    const handle = await fs.open(path, "wx");
    await handle.writeFile(JSON.stringify({ pid: process.pid, acquired_at: new Date().toISOString() }));
    await handle.close();
    return async () => { await fs.rm(path, { force: true }); };
  } catch (error) {
    if (error.code === "EEXIST") fail("R8_LOCK_BUSY", "R8 effect journal is locked by another writer");
    throw error;
  }
}

async function writeCheckpoint(root, checkpoint) {
  const path = pathsFor(root).checkpoint;
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(checkpoint)}\n`, { flag: "wx" });
  await fs.rename(temporary, path);
}

export async function recoverCheckpoint(root, { sourcing_id = null } = {}) {
  const bundle = await readBundle(root, { sourcing_id });
  if (bundle.checkpoint_status !== "LAG") return Object.freeze({ changed: false, checkpoint_status: bundle.checkpoint_status, event_count: bundle.events.length, state_digest: bundle.state?.state_digest ?? null });
  const release = await lock(root);
  try {
    const current = await readBundle(root, { sourcing_id });
    if (current.checkpoint_status !== "LAG") return Object.freeze({ changed: false, checkpoint_status: current.checkpoint_status, event_count: current.events.length, state_digest: current.state?.state_digest ?? null });
    await writeCheckpoint(root, checkpointFor(current.state));
    return Object.freeze({ changed: true, checkpoint_status: "CURRENT", event_count: current.events.length, state_digest: current.state.state_digest });
  } finally { await release(); }
}

export async function readBundle(root, { sourcing_id = null } = {}) {
  const events = await loadEvents(root, sourcing_id);
  const checkpoint = await loadCheckpoint(root);
  if (!checkpoint && events.length === 0) return Object.freeze({ events: [], checkpoint: null, state: sourcing_id ? freeze(initialState(sourcing_id)) : null, checkpoint_status: "NO_CHECKPOINT" });
  const state = reduceEvents(events, { sourcing_id: sourcing_id ?? checkpoint?.sourcing_id });
  let checkpoint_status = "NO_CHECKPOINT";
  if (checkpoint) {
    if (checkpoint.checkpoint_digest !== sha256Canonical({ checkpoint_schema_version: checkpoint.checkpoint_schema_version, sourcing_id: checkpoint.sourcing_id, expected_event_count: checkpoint.expected_event_count, expected_head_event_digest: checkpoint.expected_head_event_digest, expected_state_digest: checkpoint.expected_state_digest })) fail("CHECKPOINT_CORRUPTION", "R8 checkpoint digest mismatch");
    checkpoint_status = checkpoint.expected_event_count === state.event_count && checkpoint.expected_head_event_digest === state.head_event_digest && checkpoint.expected_state_digest === state.state_digest ? "CURRENT" : checkpoint.expected_event_count < state.event_count ? "LAG" : "AHEAD_OR_MISMATCH";
    if (checkpoint_status === "AHEAD_OR_MISMATCH") fail("CHECKPOINT_AHEAD", "R8 checkpoint is ahead of reconstructed journal");
  }
  for (const event of events) await assertArtifacts(root, event.artifact_refs);
  return Object.freeze({ events, checkpoint, state, checkpoint_status });
}

export async function appendCommand(root, rawCommand, { failpoint = null, recorded_at = "2026-09-03T12:00:00.000Z" } = {}) {
  const command = validateCommand(rawCommand);
  const paths = pathsFor(root);
  await fs.mkdir(paths.root, { recursive: true });
  await fs.mkdir(paths.artifacts, { recursive: true });
  const release = await lock(root);
  try {
    const bundle = await readBundle(root, { sourcing_id: command.sourcing_id });
    const existing = bundle.events.find((event) => event.command_id === command.command_id);
    const semantic = sha256Canonical({ sourcing_id: command.sourcing_id, command_type: command.command_type, effect_id: command.effect_id, payload: command.payload, artifact_refs: command.artifact_refs });
    if (existing) {
      if (existing.payload.command_semantic_digest !== semantic) fail("COMMAND_REPLAY_CONFLICT", "command ID was reused for a different effect mutation");
      return Object.freeze({ outcome: "DUPLICATE_COMMAND_REPLAY", command_id: command.command_id, event_id: existing.event_id, event_digest: existing.event_digest, sequence: existing.sequence, duplicate: true });
    }
    const requiredArtifactType = {
      EFFECT_INTENT_CREATED: "EFFECT_INTENT",
      EFFECT_PREVIEWED: "EFFECT_PREVIEW",
      EFFECT_APPROVED: "EFFECT_APPROVAL",
      EFFECT_RESULT_RECORDED: "EFFECT_RAW_RESULT",
      EFFECT_OBSERVATION_RECORDED: "EFFECT_OBSERVATION",
    }[command.command_type];
    if (requiredArtifactType && !command.artifact_refs.some((ref) => ref.artifact_type === requiredArtifactType)) fail("MISSING_COMMAND_ARTIFACT", `${command.command_type} requires a ${requiredArtifactType} artifact`);
    if (command.command_type === "EFFECT_APPROVED" && !command.artifact_refs.some((ref) => ref.artifact_type === "EFFECT_APPROVAL_CANDIDATE")) fail("MISSING_COMMAND_ARTIFACT", "EFFECT_APPROVED requires an EFFECT_APPROVAL_CANDIDATE artifact");
    await assertArtifacts(root, command.artifact_refs);
    if (command.expected_head_event_digest !== null && command.expected_head_event_digest !== bundle.state.head_event_digest) fail("STALE_HEAD", "effect command expected a different journal head");
    const eventType = command.command_type === "EFFECT_RESULT_RECORDED"
      ? command.payload.classification === "PRE_EXECUTION_REJECTED" ? "EFFECT_PREEXECUTION_REJECTED" : command.payload.classification === "MUTATION_ACCEPTED" ? "EFFECT_MUTATION_ACCEPTED" : "EFFECT_AMBIGUOUS"
      : command.command_type;
    if (!EVENT_TYPES.includes(eventType)) fail("UNKNOWN_EVENT_TYPE", "command cannot derive a registered event");
    const payload = { ...clone(command.payload), command_semantic_digest: semantic };
    const event = {
      event_schema_version: JOURNAL_VERSION,
      sourcing_id: command.sourcing_id,
      sequence: bundle.events.length + 1,
      event_id: `r8-event-${randomUUID()}`,
      command_id: command.command_id,
      event_type: eventType,
      effect_id: command.effect_id,
      payload,
      artifact_refs: command.artifact_refs,
      previous_event_digest: bundle.state.head_event_digest,
      event_digest: null,
      recorded_at,
    };
    event.event_digest = eventDigest(event);
    validateEvent(event, command.sourcing_id, bundle.state.head_event_digest, event.sequence);
    const nextState = applyEvent(bundle.state, event);
    const line = `${JSON.stringify(event)}\n`;
    const handle = await fs.open(paths.journal, "a");
    try { await handle.writeFile(line); await handle.sync(); } finally { await handle.close(); }
    if (failpoint === "AFTER_EVENT_FSYNC_BEFORE_CHECKPOINT") fail("R8_FAILPOINT", "crashed after event durability before checkpoint", { failpoint });
    await writeCheckpoint(root, checkpointFor(nextState));
    if (failpoint === "AFTER_CHECKPOINT_BEFORE_RESPONSE") fail("R8_FAILPOINT", "crashed after checkpoint before response", { failpoint });
    return Object.freeze({ outcome: "EVENT_ACCEPTED", command_id: command.command_id, event_id: event.event_id, event_digest: event.event_digest, sequence: event.sequence, duplicate: false });
  } finally { await release(); }
}

export function command({ sourcing_id, command_id, command_type, effect_id, payload, artifact_refs = [], expected_head_event_digest = null }) {
  return { command_schema_version: `${R8_VERSION}.command`, sourcing_id, command_id, command_type, effect_id, payload, artifact_refs, expected_head_event_digest };
}

export async function verifyBundle(root, options = {}) {
  try {
    const bundle = await readBundle(root, options);
    return Object.freeze({ valid: true, read_only: true, checkpoint_status: bundle.checkpoint_status, completeness: bundle.checkpoint_status === "CURRENT" ? "PROVEN" : bundle.events.length > 0 ? "NOT_PROVEN" : "EMPTY", event_count: bundle.events.length, state_digest: bundle.state?.state_digest ?? null, head_event_digest: bundle.state?.head_event_digest ?? null });
  } catch (error) {
    return Object.freeze({ valid: false, read_only: true, code: error.code ?? "R8_BUNDLE_INVALID", message: error.message });
  }
}

export { ARTIFACT_TYPES, COMMAND_KEYS, EVENT_KEYS, eventDigest, genesis, stateDigest };
