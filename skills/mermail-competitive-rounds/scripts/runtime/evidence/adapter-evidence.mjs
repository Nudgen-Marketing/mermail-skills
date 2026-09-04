import { createHash } from "node:crypto";

import {
  AUTHORITY,
  canonicalize,
  closeInitialRound,
  compileCommonPacket,
  compileSupplierPacket,
  freezeManifest,
  normalizeManifest,
  openInitialRound,
  sha256Canonical,
} from "../authority/manifest-round-compiler.mjs";

export const R4_VERSIONS = Object.freeze({
  snapshot: "r4.source-snapshot.v1",
  proposal: "r4.claim-proposal.v1",
  evidence: "r4.evidence-record.v1",
  lanePacket: "r4.lane-packet.v1",
  adapter: "r4-adapter.v1",
});

export const READ_ONLY_TOOLS = Object.freeze([
  "list_workspaces",
  "list_mailboxes",
  "get_mailbox",
  "list_emails",
  "search_emails",
  "get_email",
  "get_email_context",
  "get_thread",
]);

export const MESSAGE_CLASSES = Object.freeze(["INBOUND", "OUTBOUND", "DRAFT", "UNKNOWN"]);
export const CONTENT_STATES = Object.freeze([
  "CONTENT_AVAILABLE_FOR_EVIDENCE",
  "CONTENT_METADATA_ONLY",
  "CONTENT_BLOCKED",
]);
export const VERIFICATION_STATES = Object.freeze([
  "VERIFIED",
  "UNSUPPORTED",
  "AMBIGUOUS",
  "CONFLICT",
  "SOURCE_UNAVAILABLE",
  "SOURCE_BLOCKED",
  "LATE",
  "UNKNOWN",
]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u;
const ID_RE = /^[a-z0-9][a-z0-9._:-]{0,255}$/iu;
const FIELD_NAMES = new Set(["price", "delivery_days", "payment_terms", "no_revision"]);
const PRODUCER_KINDS = new Set(["MANUAL_ASSERTION", "DETERMINISTIC_EXTRACTOR", "LLM_PROPOSAL"]);
const QUOTED_PROVENANCE = "QUOTED_HISTORY";
const CURRENT_PROVENANCE = "CURRENT_MESSAGE";

const SNAPSHOT_KEYS = [
  "snapshot_schema_version",
  "source_snapshot_id",
  "observed_at",
  "adapter_version",
  "workspace_id",
  "mailbox_id",
  "email_id",
  "thread_id",
  "provider_message_id",
  "in_reply_to",
  "references",
  "message_class",
  "folder_id",
  "sender",
  "recipients",
  "subject",
  "message_timestamps",
  "scan_status",
  "sender_authentication",
  "delivery_status",
  "action_metadata",
  "content",
  "content_state",
  "raw_content_hash",
  "content_hash",
  "metadata_digest",
  "source_snapshot_digest",
];

const PROPOSAL_KEYS = [
  "proposal_schema_version",
  "sourcing_id",
  "round_id",
  "supplier_id",
  "source_snapshot_digest",
  "mailbox_id",
  "email_id",
  "provider_message_id",
  "source_span",
  "raw_source_fragment",
  "field_name",
  "proposed_value",
  "proposed_unit",
  "proposed_currency",
  "producer",
];

const SPAN_KEYS = ["representation", "provenance_class", "content_hash", "start", "end", "occurrence"];

const EVIDENCE_KEYS = [
  "evidence_schema_version",
  "evidence_id",
  "sourcing_id",
  "round_id",
  "supplier_id",
  "source_snapshot_id",
  "source_snapshot_digest",
  "mailbox_id",
  "email_id",
  "provider_message_id",
  "source_span",
  "raw_source_fragment",
  "field_name",
  "normalized_value",
  "unit",
  "currency",
  "producer",
  "time_evidence",
  "verification_state",
  "reason",
  "predecessor_evidence_id",
  "record_digest",
];

const LANE_PACKET_KEYS = [
  "packet_schema_version",
  "packet_type",
  "sourcing_id",
  "round_id",
  "manifest_revision",
  "manifest_digest",
  "supplier_id",
  "supplier_identity",
  "common_field_schema",
  "source_snapshots",
  "trust_labels",
  "packet_digest",
];

const FORBIDDEN_PACKET_KEYS = new Set([
  "reserve",
  "buyer_reserve",
  "batna",
  "buyer_batna",
  "credentials",
  "oauth",
  "token",
  "mcp",
  "mcp_config",
  "effect_capability",
  "send_email",
  "reply_to_email",
  "approval",
  "approval_state",
  "other_suppliers",
  "competitor_evidence",
  "foreign_evidence",
]);

export class R4ValidationError extends Error {
  constructor(code, message, details = {}) {
    super(`${code}: ${message}`);
    this.name = "R4ValidationError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = {}) {
  throw new R4ValidationError(code, message, details);
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function requireObject(value, path) {
  if (!isPlainObject(value)) fail("INVALID_OBJECT", `${path} must be a plain object`, { path });
  return value;
}

function requireArray(value, path) {
  if (!Array.isArray(value)) fail("INVALID_ARRAY", `${path} must be an array`, { path });
  return value;
}

function exactKeys(value, allowed, path) {
  requireObject(value, path);
  const allow = new Set(allowed);
  const unknown = Object.keys(value).filter((key) => !allow.has(key));
  if (unknown.length) fail("UNKNOWN_FIELD", `${path} contains unknown field(s): ${unknown.join(", ")}`, { path, unknown });
  return value;
}

function requiredKeys(value, required, path) {
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) fail("MISSING_FIELD", `${path}.${key} is required`, { path: `${path}.${key}` });
  }
}

function optionalString(value, path, { max = 4096 } = {}) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || value.length > max) fail("INVALID_STRING", `${path} must be null or a string of length <= ${max}`, { path });
  return value;
}

function requiredString(value, path, { max = 4096, pattern = null } = {}) {
  if (typeof value !== "string" || value.length < 1 || value.length > max) fail("INVALID_STRING", `${path} must be a non-empty string of length <= ${max}`, { path });
  if (pattern && !pattern.test(value)) fail("INVALID_IDENTIFIER", `${path} has an invalid format`, { path });
  return value;
}

function nullableBoolean(value, path) {
  if (value !== null && typeof value !== "boolean") fail("INVALID_BOOLEAN", `${path} must be boolean or null`, { path });
  return value;
}

function nullableNumber(value, path) {
  if (value !== null && (typeof value !== "number" || !Number.isFinite(value))) fail("INVALID_NUMBER", `${path} must be finite number or null`, { path });
  return value;
}

function normalizeUtc(value, path, { required = false } = {}) {
  if (value === null || value === undefined) {
    if (required) fail("MISSING_TIMESTAMP", `${path} is required`, { path });
    return null;
  }
  requiredString(value, path, { max: 64 });
  if (!UTC_RE.test(value)) fail("INVALID_TIMESTAMP", `${path} must be an explicit UTC Z timestamp`, { path });
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) fail("INVALID_TIMESTAMP", `${path} is not a real timestamp`, { path });
  return parsed.toISOString();
}

function normalizeNullableId(value, path) {
  if (value === null || value === undefined) return null;
  return requiredString(value, path, { max: 500, pattern: ID_RE });
}

function sha256Text(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function normalizeText(value) {
  if (typeof value !== "string") return null;
  return value.replace(/\r\n?/gu, "\n").normalize("NFC");
}

function hashText(value) {
  return value === null ? null : sha256Text(value);
}

function normalizeAddress(value, path) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (isPlainObject(value)) {
    const candidate = value.email ?? value.address ?? value.value;
    if (typeof candidate === "string") return candidate;
  }
  fail("INVALID_ADDRESS", `${path} did not expose a string email/address`, { path });
}

function normalizeAddresses(value, path) {
  if (value === null || value === undefined) return [];
  const values = Array.isArray(value) ? value : [value];
  return values.map((entry, index) => normalizeAddress(entry, `${path}[${index}]`)).filter((entry) => entry !== null);
}

function normalizeReferenceList(value, path) {
  if (value === null || value === undefined) return [];
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed.map((entry, index) => requiredString(String(entry), `${path}[${index}]`, { max: 1000 }));
      } catch {
        // Preserve the existing conservative token behavior for non-JSON strings.
      }
    }
    return trimmed.split(/\s+/u);
  }
  if (Array.isArray(value)) return value.map((entry, index) => requiredString(String(entry), `${path}[${index}]`, { max: 1000 }));
  fail("INVALID_REFERENCE_LIST", `${path} must be a string, array, or null`, { path });
}

function getFirst(value, names) {
  if (!isPlainObject(value)) return undefined;
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(value, name) && value[name] !== undefined) return value[name];
  }
  return undefined;
}

function getNested(value, objectNames, fieldNames) {
  for (const objectName of objectNames) {
    const nested = isPlainObject(value) ? value[objectName] : undefined;
    const candidate = getFirst(nested, fieldNames);
    if (candidate !== undefined) return candidate;
  }
  return undefined;
}

function unwrapStructuredContent(response) {
  if (response === null || response === undefined) return null;
  if (Object.prototype.hasOwnProperty.call(response, "structuredContent")) return response.structuredContent;
  if (Object.prototype.hasOwnProperty.call(response, "result")) return unwrapStructuredContent(response.result);
  if (Array.isArray(response.content)) {
    const textBlock = response.content.find((block) => block?.type === "text" && typeof block.text === "string");
    if (textBlock) {
      try {
        return JSON.parse(textBlock.text);
      } catch {
        return textBlock.text;
      }
    }
  }
  return response;
}

function assertSuccessfulReadEnvelope(response, toolName) {
  requireObject(response, "response");
  const http = response.http_status ?? response.httpStatus;
  if (http !== undefined && http !== 200) fail("READ_HTTP_FAILURE", `${toolName} returned HTTP ${http}`, { toolName, http_status: http });
  if (response.jsonrpc !== undefined && response.jsonrpc !== "2.0") fail("READ_RPC_FAILURE", `${toolName} did not return JSON-RPC 2.0`, { toolName });
  if (response.error !== undefined && response.error !== null) fail("READ_JSONRPC_ERROR", `${toolName} returned a JSON-RPC error`, { toolName });
  const result = response.result ?? response;
  if (result?.isError === true) fail("READ_TOOL_ERROR", `${toolName} returned an MCP tool error`, { toolName });
  return result;
}

export function createReadOnlyMermailAdapter({ call, endpoint = null, profile = null, adapterVersion = R4_VERSIONS.adapter }) {
  if (typeof call !== "function") fail("INVALID_ADAPTER", "a transport call function is required");
  const invoke = async (toolName, argumentsObject = {}) => {
    if (!READ_ONLY_TOOLS.includes(toolName)) fail("READ_TOOL_NOT_ALLOWED", `${toolName} is outside the R4 read-only surface`, { toolName });
    const response = await call(toolName, structuredClone(argumentsObject));
    assertSuccessfulReadEnvelope(response, toolName);
    return Object.freeze({
      adapter_version: adapterVersion,
      endpoint,
      profile,
      tool: toolName,
      arguments: structuredClone(argumentsObject),
      response,
    });
  };
  return Object.freeze({
    endpoint,
    profile,
    adapter_version: adapterVersion,
    read: invoke,
    listWorkspaces: (query = {}) => invoke("list_workspaces", { query }),
    listMailboxes: (query = {}) => invoke("list_mailboxes", { query }),
    getMailbox: (mailboxId, query = {}) => invoke("get_mailbox", { mailboxId, query }),
    listEmails: (mailboxId, query = {}) => invoke("list_emails", { mailboxId, query }),
    searchEmails: (mailboxId, query = {}) => invoke("search_emails", { mailboxId, query }),
    getEmail: (mailboxId, emailId, query = {}) => invoke("get_email", { mailboxId, emailId, query }),
    getEmailContext: (mailboxId, emailId, query = {}) => invoke("get_email_context", { mailboxId, emailId, query }),
    getThread: (mailboxId, threadId, query = {}) => invoke("get_thread", { mailboxId, threadId, query }),
  });
}

function extractEmailRecord(response) {
  const result = unwrapStructuredContent(response);
  if (Array.isArray(result)) {
    if (result.length !== 1) fail("AMBIGUOUS_EMAIL_RESULT", "an exact get_email read must expose one message object");
    return result[0];
  }
  if (isPlainObject(result)) {
    for (const key of ["email", "message", "data"]) {
      if (isPlainObject(result[key])) return result[key];
    }
    return result;
  }
  fail("INVALID_EMAIL_RESULT", "get_email did not expose an email object");
}

function classifyMessage(folderId, record) {
  const folder = String(folderId ?? "").toLowerCase();
  if (folder === "draft" || folder === "drafts") return "DRAFT";
  if (folder === "inbox" || folder === "archive" || folder === "spam") return "INBOUND";
  if (folder === "sent" || folder === "outbox") return "OUTBOUND";
  const direction = String(getFirst(record, ["direction", "message_direction"]) ?? "").toLowerCase();
  if (direction === "inbound" || direction === "received") return "INBOUND";
  if (direction === "outbound" || direction === "sent") return "OUTBOUND";
  return "UNKNOWN";
}

function normalizeSenderAuthentication(value) {
  if (value === null || value === undefined) return { status: "unknown", reason: "field_absent" };
  if (!isPlainObject(value)) return { status: "unknown", reason: "unstructured_verdict" };
  const status = typeof value.status === "string" ? value.status.toLowerCase() : "unknown";
  const reason = typeof value.reason === "string" ? value.reason : null;
  const result = { status, reason };
  for (const key of ["spf", "dkim", "dmarc"]) {
    if (typeof value[key] === "string") result[key] = value[key].toLowerCase();
  }
  return result;
}

function normalizeScanStatus(value) {
  if (value === null || value === undefined) return "unknown";
  return String(value).toLowerCase();
}

function contentStateFor({ scanStatus, held, text }) {
  const blocked = new Set(["blocked", "malicious", "quarantined", "held", "unsafe", "infected"]);
  if (held === true || blocked.has(scanStatus)) return "CONTENT_BLOCKED";
  if (scanStatus === "clean" && typeof text === "string") return "CONTENT_AVAILABLE_FOR_EVIDENCE";
  return "CONTENT_METADATA_ONLY";
}

function partitionQuotedHistory(text) {
  if (text === null) return { current_text: null, quoted_history_text: null };
  const lines = text.split("\n");
  const current = [];
  const quoted = [];
  let quoteMode = false;
  for (const line of lines) {
    const isQuote = /^\s*>/u.test(line) || /^\s*(?:on .+ wrote:|-{2,}\s*original message\s*-{2,})\s*$/iu.test(line);
    if (isQuote) quoteMode = true;
    if (quoteMode) quoted.push(line);
    else current.push(line);
  }
  return {
    current_text: current.join("\n").trimEnd(),
    quoted_history_text: quoted.length ? quoted.join("\n") : null,
  };
}

function normalizeActionMetadata(value) {
  if (value === null || value === undefined) return null;
  if (!isPlainObject(value)) return null;
  const result = {};
  for (const key of ["reply_targets", "replyTargets", "source_draft_id", "thread_id", "email_id"]) {
    if (Object.prototype.hasOwnProperty.call(value, key)) result[key] = structuredClone(value[key]);
  }
  return Object.keys(result).length ? result : null;
}

function stableMetadataFromSnapshot(snapshot) {
  return {
    workspace_id: snapshot.workspace_id,
    mailbox_id: snapshot.mailbox_id,
    email_id: snapshot.email_id,
    thread_id: snapshot.thread_id,
    provider_message_id: snapshot.provider_message_id,
    in_reply_to: snapshot.in_reply_to,
    references: snapshot.references,
    message_class: snapshot.message_class,
    folder_id: snapshot.folder_id,
    sender: snapshot.sender,
    recipients: snapshot.recipients,
    subject: snapshot.subject,
    message_timestamps: snapshot.message_timestamps,
    scan_status: snapshot.scan_status,
    sender_authentication: snapshot.sender_authentication,
    delivery_status: snapshot.delivery_status,
    action_metadata: snapshot.action_metadata,
    content_state: snapshot.content_state,
    content_hash: snapshot.content_hash,
    raw_content_hash: snapshot.raw_content_hash,
  };
}

function snapshotStablePayload(snapshot) {
  return {
    snapshot_schema_version: snapshot.snapshot_schema_version,
    workspace_id: snapshot.workspace_id,
    mailbox_id: snapshot.mailbox_id,
    email_id: snapshot.email_id,
    thread_id: snapshot.thread_id,
    provider_message_id: snapshot.provider_message_id,
    in_reply_to: snapshot.in_reply_to,
    references: snapshot.references,
    message_class: snapshot.message_class,
    folder_id: snapshot.folder_id,
    sender: snapshot.sender,
    recipients: snapshot.recipients,
    subject: snapshot.subject,
    message_timestamps: snapshot.message_timestamps,
    scan_status: snapshot.scan_status,
    sender_authentication: snapshot.sender_authentication,
    delivery_status: snapshot.delivery_status,
    action_metadata: snapshot.action_metadata,
    content: snapshot.content,
    content_state: snapshot.content_state,
    raw_content_hash: snapshot.raw_content_hash,
    content_hash: snapshot.content_hash,
  };
}

export function createSourceSnapshot({
  workspace_id = null,
  mailbox_id,
  email_id,
  record,
  observed_at,
  adapter_version = R4_VERSIONS.adapter,
}) {
  requireObject(record, "record");
  const requestedMailbox = requiredString(mailbox_id, "mailbox_id", { max: 500 });
  const requestedEmail = requiredString(email_id, "email_id", { max: 500 });
  const recordMailbox = getFirst(record, ["mailbox_id", "mailboxId"]);
  const recordEmail = getFirst(record, ["id", "email_id", "emailId"]);
  const recordWorkspace = getFirst(record, ["workspace_id", "workspaceId"]);
  if (recordMailbox !== undefined && String(recordMailbox) !== requestedMailbox) fail("MAILBOX_ID_MISMATCH", "read response mailbox does not match requested mailbox", { requested: requestedMailbox, observed: recordMailbox });
  if (recordEmail !== undefined && String(recordEmail) !== requestedEmail) fail("EMAIL_ID_MISMATCH", "read response email does not match requested email", { requested: requestedEmail, observed: recordEmail });
  if (workspace_id !== null && recordWorkspace !== undefined && String(recordWorkspace) !== String(workspace_id)) fail("WORKSPACE_ID_MISMATCH", "read response workspace does not match requested workspace", { requested: workspace_id, observed: recordWorkspace });

  const folderId = getFirst(record, ["folder_id", "folderId", "folder"]);
  const folder = typeof folderId === "string" ? folderId.toLowerCase() : null;
  const providerMetadata = getFirst(record, ["provider_metadata", "providerMetadata"]);
  const providerMessageId = getFirst(record, ["message_id", "messageId", "provider_message_id", "providerMessageId"])
    ?? getFirst(providerMetadata, ["messageId", "message_id"])
    ?? null;
  const senderValue = getFirst(record, ["from", "sender", "sender_email"]);
  const textValue = getFirst(record, ["text", "body_text", "content_text"])
    ?? (typeof record.body === "string" ? record.body : undefined)
    ?? (isPlainObject(record.body) ? getFirst(record.body, ["text", "plain"]) : undefined);
  const htmlValue = getFirst(record, ["html", "body_html", "content_html"])
    ?? (isPlainObject(record.body) ? getFirst(record.body, ["html"]) : undefined);
  const normalizedText = normalizeText(textValue);
  const quoteParts = partitionQuotedHistory(normalizedText);
  const scanStatus = normalizeScanStatus(getFirst(record, ["scan_status", "scanStatus"]));
  const held = getFirst(record, ["held", "is_held", "isHeld"]) === true || folder === "held" || folder === "quarantine";
  const contentState = contentStateFor({ scanStatus, held, text: normalizedText });
  const content = {
    representation: normalizedText !== null ? "TEXT" : typeof htmlValue === "string" ? "HTML_UNSUPPORTED" : "NONE",
    text: contentState === "CONTENT_AVAILABLE_FOR_EVIDENCE" ? normalizedText : null,
    current_text: contentState === "CONTENT_AVAILABLE_FOR_EVIDENCE" ? quoteParts.current_text : null,
    quoted_history_text: contentState === "CONTENT_AVAILABLE_FOR_EVIDENCE" ? quoteParts.quoted_history_text : null,
    html_hash: typeof htmlValue === "string" ? hashText(normalizeText(htmlValue)) : null,
    source: normalizedText !== null ? "Mermail safe/scan-gated text" : typeof htmlValue === "string" ? "Mermail HTML not enabled by R4" : "Mermail content not exposed",
  };
  const timestamps = {
    message_at: normalizeUtc(getFirst(record, ["date", "timestamp", "message_timestamp", "messageTimestamp"]), "message_timestamps.message_at"),
    sent_at: normalizeUtc(getFirst(record, ["sent_at", "sentAt"]), "message_timestamps.sent_at"),
    received_at: normalizeUtc(getFirst(record, ["received_at", "receivedAt"]), "message_timestamps.received_at"),
    provider_at: normalizeUtc(getFirst(record, ["provider_timestamp", "providerTimestamp"]), "message_timestamps.provider_at"),
  };
  const recipientValue = getFirst(record, ["to", "recipients", "recipient"]);
  const snapshot = {
    snapshot_schema_version: R4_VERSIONS.snapshot,
    source_snapshot_id: null,
    observed_at: normalizeUtc(observed_at, "observed_at", { required: true }),
    adapter_version: requiredString(adapter_version, "adapter_version", { max: 128 }),
    workspace_id: workspace_id === null ? null : requiredString(String(workspace_id), "workspace_id", { max: 500 }),
    mailbox_id: requestedMailbox,
    email_id: requestedEmail,
    thread_id: normalizeNullableId(getFirst(record, ["thread_id", "threadId"]), "thread_id"),
    provider_message_id: optionalString(providerMessageId, "provider_message_id", { max: 2000 }),
    in_reply_to: optionalString(getFirst(record, ["in_reply_to", "inReplyTo"]), "in_reply_to", { max: 2000 }),
    references: normalizeReferenceList(getFirst(record, ["references", "email_references", "emailReferences"]), "references"),
    message_class: classifyMessage(folder, record),
    folder_id: optionalString(folderId ?? null, "folder_id", { max: 128 }),
    sender: normalizeAddress(senderValue, "sender"),
    recipients: normalizeAddresses(recipientValue, "recipients"),
    subject: optionalString(getFirst(record, ["subject"]), "subject", { max: 2000 }),
    message_timestamps: timestamps,
    scan_status: scanStatus,
    sender_authentication: normalizeSenderAuthentication(getFirst(record, ["sender_authentication", "senderAuthentication"])),
    delivery_status: optionalString(getFirst(record, ["delivery_status", "deliveryStatus"]), "delivery_status", { max: 128 }),
    action_metadata: normalizeActionMetadata(getFirst(record, ["action_metadata", "actionMetadata"])),
    content,
    content_state: contentState,
    raw_content_hash: hashText(typeof textValue === "string" ? textValue : typeof htmlValue === "string" ? htmlValue : null),
    content_hash: hashText(content.text),
    metadata_digest: null,
    source_snapshot_digest: null,
  };
  const stablePayload = snapshotStablePayload(snapshot);
  snapshot.metadata_digest = sha256Canonical(stableMetadataFromSnapshot(snapshot));
  snapshot.source_snapshot_digest = sha256Canonical(stablePayload);
  snapshot.source_snapshot_id = `r4-source-${snapshot.source_snapshot_digest}`;
  return freezeAndValidateSnapshot(snapshot);
}

function freezeAndValidateSnapshot(snapshot) {
  validateSourceSnapshot(snapshot);
  return deepFreeze(snapshot);
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export function validateSourceSnapshot(snapshot) {
  exactKeys(snapshot, SNAPSHOT_KEYS, "source_snapshot");
  requiredKeys(snapshot, SNAPSHOT_KEYS, "source_snapshot");
  if (snapshot.snapshot_schema_version !== R4_VERSIONS.snapshot) fail("SNAPSHOT_VERSION", "unsupported source snapshot schema");
  requiredString(snapshot.source_snapshot_id, "source_snapshot_id", { max: 200 });
  normalizeUtc(snapshot.observed_at, "observed_at", { required: true });
  requiredString(snapshot.adapter_version, "adapter_version", { max: 128 });
  for (const key of ["workspace_id", "mailbox_id", "email_id", "thread_id", "provider_message_id", "in_reply_to", "folder_id", "sender", "subject", "delivery_status"]) optionalString(snapshot[key], `source_snapshot.${key}`, { max: 4000 });
  normalizeNullableId(snapshot.mailbox_id, "mailbox_id");
  normalizeNullableId(snapshot.email_id, "email_id");
  if (!MESSAGE_CLASSES.includes(snapshot.message_class)) fail("MESSAGE_CLASS", "unknown message class");
  if (!CONTENT_STATES.includes(snapshot.content_state)) fail("CONTENT_STATE", "unknown content state");
  requireArray(snapshot.recipients, "recipients");
  requireArray(snapshot.references, "references");
  exactKeys(snapshot.message_timestamps, ["message_at", "sent_at", "received_at", "provider_at"], "message_timestamps");
  for (const [key, value] of Object.entries(snapshot.message_timestamps)) normalizeUtc(value, `message_timestamps.${key}`);
  requireObject(snapshot.sender_authentication, "sender_authentication");
  if (typeof snapshot.sender_authentication.status !== "string") fail("AUTH_VERDICT", "sender_authentication.status must be a string");
  if (snapshot.action_metadata !== null) requireObject(snapshot.action_metadata, "action_metadata");
  exactKeys(snapshot.content, ["representation", "text", "current_text", "quoted_history_text", "html_hash", "source"], "content");
  for (const key of ["text", "current_text", "quoted_history_text", "html_hash"]) optionalString(snapshot.content[key], `content.${key}`, { max: 2_000_000 });
  requiredString(snapshot.content.representation, "content.representation", { max: 64 });
  requiredString(snapshot.content.source, "content.source", { max: 256 });
  for (const key of ["raw_content_hash", "content_hash", "metadata_digest", "source_snapshot_digest"]) {
    if (snapshot[key] !== null) requiredString(snapshot[key], key, { max: 128 });
  }
  const expectedContentHash = sha256TextOrNull(snapshot.content.text);
  if (expectedContentHash !== snapshot.content_hash) fail("CONTENT_HASH_MISMATCH", "content hash does not match normalized text");
  const expectedMetadataDigest = sha256Canonical(stableMetadataFromSnapshot(snapshot));
  if (expectedMetadataDigest !== snapshot.metadata_digest) fail("METADATA_DIGEST_MISMATCH", "metadata digest does not match normalized metadata");
  const expectedSnapshotDigest = sha256Canonical(snapshotStablePayload(snapshot));
  if (expectedSnapshotDigest !== snapshot.source_snapshot_digest) fail("SNAPSHOT_DIGEST_MISMATCH", "source snapshot digest does not match its contents");
  if (snapshot.source_snapshot_id !== `r4-source-${snapshot.source_snapshot_digest}`) fail("SNAPSHOT_ID_MISMATCH", "source snapshot ID is not derived from its digest");
  return true;
}

function sha256TextOrNull(value) {
  return value === null ? null : sha256Text(value);
}

export function normalizeMermailEmailObservation({ request, response, workspace_id = null, observed_at, adapter_version = R4_VERSIONS.adapter }) {
  requireObject(request, "request");
  if (request.tool !== "get_email") fail("WRONG_READ_TOOL", "source snapshot construction requires get_email", { tool: request.tool });
  const args = request.arguments ?? {};
  requiredString(args.mailboxId, "request.arguments.mailboxId", { max: 500 });
  requiredString(args.emailId, "request.arguments.emailId", { max: 500 });
  assertSuccessfulReadEnvelope(response, "get_email");
  const record = extractEmailRecord(response);
  return createSourceSnapshot({
    workspace_id,
    mailbox_id: args.mailboxId,
    email_id: args.emailId,
    record,
    observed_at,
    adapter_version,
  });
}

export function createTimeEvidence(snapshot) {
  validateSourceSnapshot(snapshot);
  const sourceTimestamp = snapshot.message_timestamps.sent_at
    ?? snapshot.message_timestamps.message_at
    ?? snapshot.message_timestamps.provider_at
    ?? snapshot.message_timestamps.received_at;
  return Object.freeze({
    schema_version: "r4.time-evidence.v1",
    source_timestamp: sourceTimestamp,
    source_timestamp_kind: sourceTimestamp
      ? snapshot.message_timestamps.sent_at === sourceTimestamp
        ? "MERMAIL_SENT_TIMESTAMP"
        : snapshot.message_timestamps.provider_at === sourceTimestamp
          ? "MERMAIL_PROVIDER_TIMESTAMP"
          : "MERMAIL_MESSAGE_TIMESTAMP"
      : "UNKNOWN",
    adapter_observed_at: snapshot.observed_at,
    authority: sourceTimestamp ? "MERMAIL_METADATA" : "ADAPTER_OBSERVATION_ONLY",
  });
}

function canonicalMoney(value, currency) {
  if (isPlainObject(value)) {
    if (typeof value.amount === "string" && /^[0-9]+(?:\.[0-9]{1,4})?$/u.test(value.amount) && typeof value.currency === "string") return { amount: value.amount, currency: value.currency.toUpperCase() };
    if (typeof value.amount === "number" && Number.isFinite(value.amount) && typeof value.currency === "string") return { amount: value.amount.toFixed(4).replace(/0+$/u, "").replace(/\.$/u, ""), currency: value.currency.toUpperCase() };
  }
  if (typeof value === "number" && Number.isFinite(value)) return { amount: value.toFixed(4).replace(/0+$/u, "").replace(/\.$/u, ""), currency: typeof currency === "string" ? currency.toUpperCase() : null };
  if (typeof value === "string") {
    const trimmed = value.trim().toUpperCase();
    const match = /^(?:(USD|EUR|GBP)\s*)?\$?\s*([0-9]+(?:\.[0-9]{1,4})?)\s*(USD|EUR|GBP)?$/u.exec(trimmed);
    if (!match) return null;
    const leading = match[1] ?? null;
    const trailing = match[3] ?? null;
    const symbolCurrency = trimmed.includes("$") ? "USD" : null;
    const currencies = [leading, trailing, symbolCurrency].filter(Boolean);
    if (new Set(currencies).size > 1) return null;
    const resolved = currencies[0] ?? (typeof currency === "string" ? currency.toUpperCase() : null);
    if (!resolved) return null;
    return { amount: match[2], currency: resolved };
  }
  return null;
}

export function normalizeTypedFieldValue(fieldName, fragment, proposedValue, proposedUnit, proposedCurrency) {
  if (fieldName === "price") {
    const parsed = canonicalMoney(fragment, null);
    const proposed = canonicalMoney(proposedValue, proposedCurrency);
    if (!parsed || !proposed) return { state: "AMBIGUOUS", reason: "price_not_unambiguously_typed" };
    if (parsed.amount !== proposed.amount || parsed.currency !== proposed.currency) return { state: "UNSUPPORTED", reason: "proposed_value_not_supported_by_source", observed: parsed };
    if (proposedCurrency !== null && proposedCurrency !== undefined && String(proposedCurrency).toUpperCase() !== proposed.currency) return { state: "UNSUPPORTED", reason: "wrong_price_currency", observed: parsed };
    if (proposedUnit !== null && proposedUnit !== undefined && proposedUnit !== "amount") return { state: "UNSUPPORTED", reason: "wrong_price_unit", observed: parsed };
    return { state: "VERIFIED", value: parsed, unit: "amount", currency: parsed.currency };
  }
  if (fieldName === "delivery_days") {
    const match = /^\s*([0-9]+)\s+days?\s*$/iu.exec(fragment);
    const proposed = isPlainObject(proposedValue) ? proposedValue.days : proposedValue;
    if (!match || !(typeof proposed === "number" || typeof proposed === "string") || String(proposed) !== match[1]) return { state: "UNSUPPORTED", reason: "delivery_days_not_supported_by_source" };
    if (proposedUnit !== null && proposedUnit !== undefined && proposedUnit !== "day") return { state: "UNSUPPORTED", reason: "wrong_delivery_unit" };
    return { state: "VERIFIED", value: { days: Number(match[1]), unit: "day" }, unit: "day", currency: null };
  }
  if (fieldName === "payment_terms") {
    const normalized = fragment.trim().replace(/\s+/gu, " ").toLowerCase();
    if (!/^(?:net \d+|prepaid|due on delivery)$/u.test(normalized)) return { state: "AMBIGUOUS", reason: "payment_terms_outside_narrow_policy" };
    const proposed = typeof proposedValue === "string" ? proposedValue.trim().replace(/\s+/gu, " ").toLowerCase() : null;
    if (proposed !== normalized) return { state: "UNSUPPORTED", reason: "proposed_value_not_supported_by_source" };
    return { state: "VERIFIED", value: normalized, unit: null, currency: null };
  }
  if (fieldName === "no_revision") {
    const normalized = fragment.trim().toLowerCase();
    const trueMarkers = new Set(["no revision", "no revisions", "firm offer", "firm bid"]);
    if (!trueMarkers.has(normalized)) return { state: "AMBIGUOUS", reason: "no_revision_marker_not_exact" };
    if (proposedValue !== true) return { state: "UNSUPPORTED", reason: "proposed_value_not_supported_by_source" };
    return { state: "VERIFIED", value: true, unit: null, currency: null };
  }
  return { state: "UNKNOWN", reason: "field_not_in_narrow_r4_policy" };
}

function assertSpanShape(span) {
  exactKeys(span, SPAN_KEYS, "source_span");
  requiredKeys(span, SPAN_KEYS, "source_span");
  if (span.representation !== "TEXT") fail("UNSUPPORTED_SPAN_REPRESENTATION", "only normalized TEXT spans are supported");
  if (![CURRENT_PROVENANCE, QUOTED_PROVENANCE].includes(span.provenance_class)) fail("SPAN_PROVENANCE_CLASS", "unsupported source span provenance class");
  requiredString(span.content_hash, "source_span.content_hash", { max: 128 });
  if (!Number.isInteger(span.start) || span.start < 0) fail("SPAN_START", "source span start must be a non-negative integer");
  if (!Number.isInteger(span.end) || span.end <= span.start) fail("SPAN_END", "source span end must be after start");
  if (!Number.isInteger(span.occurrence) || span.occurrence < 0) fail("SPAN_OCCURRENCE", "source span occurrence must be a non-negative integer");
}

export function createClaimProposal(raw) {
  if (isPlainObject(raw) && Object.prototype.hasOwnProperty.call(raw, "verification_state")) fail("SELF_VERIFICATION_FORBIDDEN", "a proposal cannot choose verification_state");
  exactKeys(raw, PROPOSAL_KEYS, "claim_proposal");
  requiredKeys(raw, PROPOSAL_KEYS, "claim_proposal");
  if (raw.proposal_schema_version !== R4_VERSIONS.proposal) fail("PROPOSAL_VERSION", "unsupported proposal schema");
  for (const key of ["sourcing_id", "round_id", "supplier_id", "source_snapshot_digest", "mailbox_id", "email_id", "field_name"]) requiredString(raw[key], `claim_proposal.${key}`, { max: 500 });
  if (raw.provider_message_id !== null) optionalString(raw.provider_message_id, "claim_proposal.provider_message_id", { max: 2000 });
  assertSpanShape(raw.source_span);
  requiredString(raw.raw_source_fragment, "claim_proposal.raw_source_fragment", { max: 10000 });
  if (!FIELD_NAMES.has(raw.field_name)) fail("FIELD_NOT_ALLOWED", `field ${raw.field_name} is outside the narrow R4 field surface`);
  exactKeys(raw.producer, ["kind", "reference"], "claim_proposal.producer");
  requiredKeys(raw.producer, ["kind", "reference"], "claim_proposal.producer");
  if (!PRODUCER_KINDS.has(raw.producer.kind)) fail("PRODUCER_KIND", "unknown proposal producer kind");
  requiredString(raw.producer.reference, "claim_proposal.producer.reference", { max: 500 });
  return deepFreeze(structuredClone(raw));
}

function makeEvidenceRecord(proposal, snapshot, patch) {
  const base = {
    evidence_schema_version: R4_VERSIONS.evidence,
    evidence_id: null,
    sourcing_id: proposal.sourcing_id,
    round_id: proposal.round_id,
    supplier_id: proposal.supplier_id,
    source_snapshot_id: snapshot?.source_snapshot_id ?? null,
    source_snapshot_digest: proposal.source_snapshot_digest,
    mailbox_id: proposal.mailbox_id,
    email_id: proposal.email_id,
    provider_message_id: snapshot?.provider_message_id ?? proposal.provider_message_id ?? null,
    source_span: structuredClone(proposal.source_span),
    raw_source_fragment: proposal.raw_source_fragment,
    field_name: proposal.field_name,
    normalized_value: null,
    unit: null,
    currency: null,
    producer: structuredClone(proposal.producer),
    time_evidence: snapshot ? createTimeEvidence(snapshot) : null,
    verification_state: "UNKNOWN",
    reason: "not_verified",
    predecessor_evidence_id: null,
    record_digest: null,
    ...patch,
  };
  base.evidence_id = `r4-evidence-${sha256Canonical({ ...base, evidence_id: null, record_digest: null })}`;
  base.record_digest = sha256Canonical({ ...base, record_digest: null });
  exactKeys(base, EVIDENCE_KEYS, "evidence_record");
  return deepFreeze(base);
}

function snapshotIntegrityReason(snapshot) {
  try {
    validateSourceSnapshot(snapshot);
    return null;
  } catch (error) {
    return error instanceof R4ValidationError ? error.code : "SNAPSHOT_INVALID";
  }
}

function findOccurrences(text, fragment) {
  const occurrences = [];
  let index = text.indexOf(fragment);
  while (index !== -1) {
    occurrences.push(index);
    index = text.indexOf(fragment, index + 1);
  }
  return occurrences;
}

function isSurrogateBoundary(text, position) {
  if (position <= 0 || position >= text.length) return true;
  const before = text.charCodeAt(position - 1);
  const at = text.charCodeAt(position);
  return !(before >= 0xd800 && before <= 0xdbff && at >= 0xdc00 && at <= 0xdfff);
}

export function verifyExactSpan(snapshot, proposal) {
  const span = proposal.source_span;
  if (span.content_hash !== snapshot.content_hash) return { state: "SOURCE_UNAVAILABLE", reason: "span_content_hash_mismatch" };
  if (span.provenance_class === QUOTED_PROVENANCE) return { state: "SOURCE_BLOCKED", reason: "quoted_history_not_current_supplier_evidence" };
  const text = snapshot.content.current_text;
  if (typeof text !== "string") return { state: "SOURCE_BLOCKED", reason: "current_safe_text_unavailable" };
  if (!isSurrogateBoundary(text, span.start) || !isSurrogateBoundary(text, span.end)) return { state: "AMBIGUOUS", reason: "span_splits_unicode_code_point" };
  if (span.end > text.length) return { state: "AMBIGUOUS", reason: "span_out_of_bounds" };
  const fragment = text.slice(span.start, span.end);
  if (fragment !== proposal.raw_source_fragment) return { state: "UNSUPPORTED", reason: "raw_fragment_does_not_match_span" };
  const occurrences = findOccurrences(text, fragment);
  if (!occurrences.includes(span.start) || occurrences[span.occurrence] !== span.start) return { state: "AMBIGUOUS", reason: "span_occurrence_not_reproducible" };
  return { state: "VERIFIED", text, fragment, occurrences };
}

function sourceMailboxMatchesSupplier(snapshot, proposal, options) {
  const mapping = options.supplier_mailboxes ?? {};
  const reverseMapping = options.mailbox_suppliers ?? {};
  if (!isPlainObject(mapping) || !isPlainObject(reverseMapping)) return false;
  const expectedMailbox = mapping[proposal.supplier_id];
  const expectedSupplier = reverseMapping[snapshot.mailbox_id];
  return typeof expectedMailbox === "string" && expectedMailbox === snapshot.mailbox_id && expectedSupplier === proposal.supplier_id;
}

function lateStatus(snapshot, options) {
  if (!options.cutoff_at) return "NOT_EVALUATED";
  const sourceTime = createTimeEvidence(snapshot).source_timestamp;
  if (!sourceTime) return "UNKNOWN";
  const cutoff = normalizeUtc(options.cutoff_at, "cutoff_at", { required: true });
  const sourceMs = Date.parse(sourceTime);
  const cutoffMs = Date.parse(cutoff);
  if (sourceMs < cutoffMs || (sourceMs === cutoffMs && options.cutoff_inclusive === true)) return "ON_TIME";
  return "LATE";
}

export function verifyClaimProposal(snapshot, rawProposal, options = {}) {
  let proposal;
  try {
    proposal = createClaimProposal(rawProposal);
  } catch (error) {
    return { verification_state: "UNKNOWN", reason: error instanceof R4ValidationError ? error.code : "INVALID_PROPOSAL" };
  }
  const snapshotError = snapshotIntegrityReason(snapshot);
  if (snapshotError) return makeEvidenceRecord(proposal, null, { verification_state: "SOURCE_UNAVAILABLE", reason: snapshotError });
  if (proposal.source_snapshot_digest !== snapshot.source_snapshot_digest) return makeEvidenceRecord(proposal, snapshot, { verification_state: "SOURCE_UNAVAILABLE", reason: "source_snapshot_digest_mismatch" });
  if (proposal.mailbox_id !== snapshot.mailbox_id || proposal.email_id !== snapshot.email_id) return makeEvidenceRecord(proposal, snapshot, { verification_state: "SOURCE_UNAVAILABLE", reason: "mailbox_or_email_identity_mismatch" });
  if (proposal.provider_message_id !== null && proposal.provider_message_id !== snapshot.provider_message_id) return makeEvidenceRecord(proposal, snapshot, { verification_state: "SOURCE_UNAVAILABLE", reason: "provider_identity_mismatch" });
  if (!sourceMailboxMatchesSupplier(snapshot, proposal, options)) return makeEvidenceRecord(proposal, snapshot, { verification_state: "SOURCE_UNAVAILABLE", reason: "supplier_mailbox_binding_mismatch" });
  if (snapshot.message_class === "DRAFT") return makeEvidenceRecord(proposal, snapshot, { verification_state: "SOURCE_BLOCKED", reason: "draft_is_not_supplier_evidence" });
  if (snapshot.content_state !== "CONTENT_AVAILABLE_FOR_EVIDENCE") return makeEvidenceRecord(proposal, snapshot, { verification_state: "SOURCE_BLOCKED", reason: snapshot.content_state });
  if (options.require_authenticated_sender === true && snapshot.sender_authentication.status !== "pass") return makeEvidenceRecord(proposal, snapshot, { verification_state: "UNKNOWN", reason: "sender_authentication_not_pass" });
  const spanResult = verifyExactSpan(snapshot, proposal);
  if (spanResult.state !== "VERIFIED") return makeEvidenceRecord(proposal, snapshot, { verification_state: spanResult.state, reason: spanResult.reason });
  const timeStatus = lateStatus(snapshot, options);
  if (timeStatus === "LATE") return makeEvidenceRecord(proposal, snapshot, { verification_state: "LATE", reason: "source_timestamp_after_round_cutoff" });
  if (timeStatus === "UNKNOWN") return makeEvidenceRecord(proposal, snapshot, { verification_state: "UNKNOWN", reason: "source_timestamp_unavailable" });
  const normalized = normalizeTypedFieldValue(proposal.field_name, spanResult.fragment, proposal.proposed_value, proposal.proposed_unit, proposal.proposed_currency);
  if (normalized.state !== "VERIFIED") return makeEvidenceRecord(proposal, snapshot, { verification_state: normalized.state, reason: normalized.reason });
  return makeEvidenceRecord(proposal, snapshot, {
    normalized_value: normalized.value,
    unit: normalized.unit,
    currency: normalized.currency,
    verification_state: "VERIFIED",
    reason: "exact_source_span_and_typed_value_verified",
  });
}

export function validateEvidenceRecord(record) {
  exactKeys(record, EVIDENCE_KEYS, "evidence_record");
  requiredKeys(record, EVIDENCE_KEYS, "evidence_record");
  if (!VERIFICATION_STATES.includes(record.verification_state)) fail("EVIDENCE_STATE", "unknown verification state");
  requiredString(record.evidence_id, "evidence_id", { max: 200 });
  requiredString(record.record_digest, "record_digest", { max: 128 });
  if (record.time_evidence !== null) requireObject(record.time_evidence, "time_evidence");
  const expectedId = `r4-evidence-${sha256Canonical({ ...record, evidence_id: null, record_digest: null })}`;
  if (expectedId !== record.evidence_id) fail("EVIDENCE_ID_MISMATCH", "evidence ID is not derived from record content");
  const expectedDigest = sha256Canonical({ ...record, record_digest: null });
  if (expectedDigest !== record.record_digest) fail("EVIDENCE_DIGEST_MISMATCH", "evidence record digest does not match record content");
  return true;
}

export function classifyEvidenceLineage(records) {
  requireArray(records, "records");
  for (const record of records) validateEvidenceRecord(record);
  const sorted = [...records].sort((a, b) => {
    const at = a.time_evidence?.source_timestamp ? Date.parse(a.time_evidence.source_timestamp) : Number.POSITIVE_INFINITY;
    const bt = b.time_evidence?.source_timestamp ? Date.parse(b.time_evidence.source_timestamp) : Number.POSITIVE_INFINITY;
    return at - bt || a.record_digest.localeCompare(b.record_digest);
  });
  const verified = sorted.filter((record) => record.verification_state === "VERIFIED");
  const values = new Set(verified.map((record) => canonicalize(record.normalized_value)));
  return Object.freeze({
    records: sorted,
    predecessor_evidence_ids: sorted.slice(0, -1).map((record) => record.evidence_id),
    status: values.size > 1 ? "CONFLICT" : values.size === 1 ? "CONSISTENT" : "NO_VERIFIED_VALUE",
    distinct_verified_values: [...values],
  });
}

export function selectEffectiveEvidence(records, { cutoff_at = null, cutoff_inclusive = false } = {}) {
  const lineage = classifyEvidenceLineage(records);
  const candidates = lineage.records.filter((record) => record.verification_state === "VERIFIED");
  const onTime = candidates.filter((record) => {
    if (!cutoff_at) return true;
    const time = record.time_evidence?.source_timestamp;
    if (!time) return false;
    const sourceMs = Date.parse(time);
    const cutoffMs = Date.parse(normalizeUtc(cutoff_at, "cutoff_at", { required: true }));
    return sourceMs < cutoffMs || (sourceMs === cutoffMs && cutoff_inclusive);
  });
  const selected = lineage.status === "CONFLICT" ? null : onTime.at(-1) ?? null;
  return Object.freeze({
    ...lineage,
    status: lineage.status === "CONFLICT" ? "CONFLICT" : selected ? "SELECTED" : "NO_ELIGIBLE_VERIFIED_VALUE",
    selected_evidence_id: selected?.evidence_id ?? null,
    late_candidates_preserved: candidates.filter((record) => !onTime.includes(record)).map((record) => record.evidence_id),
  });
}

export function correlateSourceSnapshots(first, second) {
  validateSourceSnapshot(first);
  validateSourceSnapshot(second);
  const providerMatch = first.provider_message_id !== null
    && second.provider_message_id !== null
    && first.provider_message_id === second.provider_message_id;
  const mailboxLocalDistinct = first.mailbox_id !== second.mailbox_id
    || first.email_id !== second.email_id
    || first.thread_id !== second.thread_id;
  return Object.freeze({
    classification: providerMatch ? "CORRELATED_BY_PROVIDER_RFC_ID" : "NOT_CORRELATED",
    provider_message_id_match: providerMatch,
    mailbox_local_identity_distinct: mailboxLocalDistinct,
    first_action_authority: { mailbox_id: first.mailbox_id, email_id: first.email_id },
    second_action_authority: { mailbox_id: second.mailbox_id, email_id: second.email_id },
    provider_id_is_not_local_action_authority: true,
  });
}

function scanKeys(value, path = "$") {
  if (!value || typeof value !== "object") return [];
  const hits = [];
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_PACKET_KEYS.has(key.toLowerCase())) hits.push(`${path}.${key}`);
    hits.push(...scanKeys(child, `${path}.${key}`));
  }
  return hits;
}

function snapshotForLane(snapshot, supplierId, supplierMailboxId) {
  if (snapshot.supplier_id !== undefined && snapshot.supplier_id !== supplierId) fail("FOREIGN_SNAPSHOT", "snapshot supplier does not match lane");
  if (snapshot.mailbox_id !== supplierMailboxId) fail("FOREIGN_SNAPSHOT", "snapshot mailbox does not match lane supplier mailbox", { expected: supplierMailboxId, observed: snapshot.mailbox_id });
  if (snapshot.message_class === "DRAFT") return snapshot;
  return snapshot;
}

export function compileLanePacket({ sourcing_id, round_id, manifest_revision, manifest_digest, supplier, common_field_schema, source_snapshots, allowed_source_snapshot_digests }) {
  requiredString(sourcing_id, "sourcing_id", { max: 128 });
  requiredString(round_id, "round_id", { max: 128 });
  if (!Number.isInteger(manifest_revision) || manifest_revision < 1) fail("MANIFEST_REVISION", "manifest_revision must be a positive integer");
  requiredString(manifest_digest, "manifest_digest", { max: 128 });
  exactKeys(supplier, ["supplier_id", "address", "identity_ref", "mailbox_id"], "supplier");
  requiredKeys(supplier, ["supplier_id", "address", "identity_ref", "mailbox_id"], "supplier");
  requiredString(supplier.supplier_id, "supplier.supplier_id", { max: 128 });
  requiredString(supplier.address, "supplier.address", { max: 500 });
  if (!EMAIL_RE.test(supplier.address)) fail("SUPPLIER_ADDRESS", "supplier address must be an email");
  requiredString(supplier.identity_ref, "supplier.identity_ref", { max: 500 });
  requiredString(supplier.mailbox_id, "supplier.mailbox_id", { max: 500 });
  requireArray(common_field_schema, "common_field_schema");
  requireArray(source_snapshots, "source_snapshots");
  requireArray(allowed_source_snapshot_digests, "allowed_source_snapshot_digests");
  const allowedDigests = new Set(allowed_source_snapshot_digests);
  for (const digest of allowedDigests) requiredString(digest, "allowed_source_snapshot_digests[]", { max: 128 });
  for (const field of common_field_schema) {
    exactKeys(field, ["name", "type", "unit", "currency"], "common_field_schema[]");
    requiredKeys(field, ["name", "type", "unit", "currency"], "common_field_schema[]");
    requiredString(field.name, "common_field_schema[].name", { max: 128 });
    requiredString(field.type, "common_field_schema[].type", { max: 64 });
    if (FORBIDDEN_PACKET_KEYS.has(field.name.toLowerCase())) fail("FORBIDDEN_PACKET_FIELD", `common field ${field.name} is Buyer-private or effect-bearing`);
    optionalString(field.unit, "common_field_schema[].unit", { max: 64 });
    optionalString(field.currency, "common_field_schema[].currency", { max: 8 });
  }
  const packetSnapshots = source_snapshots.map((snapshot) => {
    validateSourceSnapshot(snapshot);
    snapshotForLane(snapshot, supplier.supplier_id, supplier.mailbox_id);
    if (!allowedDigests.has(snapshot.source_snapshot_digest)) fail("SOURCE_NOT_AUTHORIZED", "lane packet references a source digest outside the adapter-authorized set", { source_snapshot_digest: snapshot.source_snapshot_digest });
    return snapshot;
  });
  const packet = {
    packet_schema_version: R4_VERSIONS.lanePacket,
    packet_type: "ONE_SUPPLIER_LANE",
    sourcing_id,
    round_id,
    manifest_revision,
    manifest_digest,
    supplier_id: supplier.supplier_id,
    supplier_identity: structuredClone(supplier),
    common_field_schema: structuredClone(common_field_schema),
    source_snapshots: packetSnapshots.map((snapshot) => structuredClone(snapshot)),
    trust_labels: {
      policy: "BUYER_CONTROL_FROM_R3",
      source_metadata: "MERMAIL_OBSERVATION",
      message_content: "UNTRUSTED_CONTENT",
      field_claims: "PROPOSAL_UNTIL_VERIFIED",
      packet_scope: "ONE_SUPPLIER_ONLY",
    },
    packet_digest: null,
  };
  const keyHits = scanKeys({
    common_field_schema: packet.common_field_schema,
    source_snapshots: packet.source_snapshots,
    supplier_identity: packet.supplier_identity,
  });
  if (keyHits.length) fail("FORBIDDEN_PACKET_FIELD", `packet contains forbidden field(s): ${keyHits.join(", ")}`, { keyHits });
  packet.packet_digest = sha256Canonical({ ...packet, packet_digest: null });
  return deepFreeze(packet);
}

export function validateLanePacket(packet, { foreignSupplierIds = [], forbiddenStrings = [] } = {}) {
  exactKeys(packet, LANE_PACKET_KEYS, "lane_packet");
  requiredKeys(packet, LANE_PACKET_KEYS, "lane_packet");
  if (packet.packet_schema_version !== R4_VERSIONS.lanePacket) fail("PACKET_VERSION", "unsupported lane packet schema");
  if (packet.packet_type !== "ONE_SUPPLIER_LANE") fail("PACKET_TYPE", "unexpected lane packet type");
  requiredString(packet.supplier_id, "lane_packet.supplier_id", { max: 128 });
  exactKeys(packet.supplier_identity, ["supplier_id", "address", "identity_ref", "mailbox_id"], "supplier_identity");
  if (packet.supplier_identity.supplier_id !== packet.supplier_id) fail("PACKET_SUPPLIER_MISMATCH", "supplier identity does not match packet supplier");
  if (packet.supplier_identity.mailbox_id === undefined) fail("PACKET_MAILBOX_MISSING", "lane packet must carry the authoritative supplier mailbox binding");
  requireArray(packet.source_snapshots, "source_snapshots");
  for (const snapshot of packet.source_snapshots) validateSourceSnapshot(snapshot);
  const serialized = canonicalize(packet);
  for (const forbidden of foreignSupplierIds) if (serialized.includes(forbidden)) fail("FOREIGN_SUPPLIER_LEAK", `packet contains foreign supplier identifier ${forbidden}`);
  for (const forbidden of forbiddenStrings) if (serialized.includes(forbidden)) fail("FOREIGN_CONTENT_LEAK", "packet contains forbidden foreign/private content");
  const expected = sha256Canonical({ ...packet, packet_digest: null });
  if (expected !== packet.packet_digest) fail("PACKET_DIGEST_MISMATCH", "packet digest mismatch");
  return true;
}

export function r3DeadlineIsolationCheck() {
  const manifest = {
    manifest_schema_version: "r3.v1",
    sourcing_id: "source-001",
    manifest_revision: 1,
    created_at: "2026-09-01T10:00:00Z",
    buyer_authority_ref: "buyer-authority-001",
    supplier_roster: [
      { supplier_id: "supplier-a", address: "supplier-a@example.test", identity_ref: "buyer-declared-a" },
      { supplier_id: "supplier-b", address: "supplier-b@example.test", identity_ref: "buyer-declared-b" },
    ],
    common_requirements: [
      { name: "delivery-days", type: "integer", unit: "day" },
      { name: "total-price", type: "money", currency: "USD" },
    ],
    hard_must_haves: [{ field: "delivery-days", operator: "lte", value: 14, unit: "day" }],
    decision_attributes: [{ field: "total-price", direction: "minimize" }],
    normalization_policy: [{ field: "total-price", unit: "amount", currency: "USD" }],
    deadline_policy: { initial_cutoff_at: "2026-09-10T17:00:00Z", final_cutoff_at: "2026-09-12T17:00:00Z", cutoff_inclusive: false, timezone: "UTC" },
    late_evidence_policy: "preserve_as_late",
    round_sequence_policy: { final_revision_enabled: false, max_final_revision_rounds: 0, final_eligibility_rule: "responded_on_time_not_withdrawn" },
    revision_policy: { amendment_mode: "append_only", protected_after_initial_open: true },
    clarification_disclosure_policy: "lane_only",
    no_deal_policy_ref: "buyer-no-deal-policy-001",
    approval_policy_ref: "buyer-effect-policy-001",
  };
  const frozen = freezeManifest(manifest, {
    action: "freeze_manifest",
    purpose: "freeze buyer sourcing policy",
    origin: { kind: AUTHORITY.BUYER_CONTROL, reference: "buyer-authority-001" },
    sourcing_id: "source-001",
    manifest_revision: 1,
    manifest_digest: sha256Canonical(normalizeManifest(manifest)),
    approver_ref: "operator-001",
    approved_at: "2026-09-02T10:00:00Z",
  });
  const opened = openInitialRound(frozen, { opened_at: "2026-09-02T11:00:00Z", origin: { kind: AUTHORITY.BUYER_CONTROL, reference: "buyer-authority-001" } });
  const hostile = {
    supplier_id: "supplier-a",
    response_status: "RESPONDED",
    response_at: "2026-09-09T10:00:00Z",
    origin: { kind: AUTHORITY.SUPPLIER_EVIDENCE, reference: "r4-hostile-mail", verification: "UNVERIFIED_STUB" },
    source_ref: "r4-evidence-a",
  };
  const closed = closeInitialRound(opened, {
    closed_at: "2026-09-10T18:00:00Z",
    observations: [hostile, { supplier_id: "supplier-b", response_status: "NO_RESPONSE", origin: { kind: AUTHORITY.SUPPLIER_EVIDENCE, reference: "stub-b", verification: "UNVERIFIED_STUB" } }],
    origin: { kind: AUTHORITY.SYSTEM_DERIVED, reference: "r4-integration-clock" },
  });
  return Object.freeze({ deadline_policy: closed.deadline_policy, supplier_message_cannot_change_deadline: closed.deadline_policy.initial_cutoff_at === new Date(manifest.deadline_policy.initial_cutoff_at).toISOString(), state_digest: closed.state_digest });
}

export { canonicalize, sha256Canonical, compileCommonPacket, compileSupplierPacket };
