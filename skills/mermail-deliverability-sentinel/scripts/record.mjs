// Offline record/checkpoint checks only. No mailbox reads, secret store,
// authentication, persistent ledger, signing or effect authorization.
import { createHash } from "node:crypto";

const HASH = /^sha256:[0-9a-f]{64}$/;
const GENESIS = `sha256:${"0".repeat(64)}`;
const id = value => typeof value === "string" && value.length > 0 && value.length <= 200 && !/\s/u.test(value);

export function canonical(value) {
  let nodes = 0;
  const visit = (item, depth) => {
    if (++nodes > 2000 || depth > 24) throw Error("record_structure_bound");
    if (typeof item === "string") return JSON.stringify(item.normalize("NFC"));
    if (typeof item === "number") {
      if (!Number.isFinite(item) || Math.abs(item) > Number.MAX_SAFE_INTEGER) throw Error("record_finite_number_required");
      return JSON.stringify(item);
    }
    if (item === null || typeof item === "boolean") return JSON.stringify(item);
    if (Array.isArray(item)) return `[${item.map(x => visit(x, depth + 1)).join(",")}]`;
    if (!item || typeof item !== "object" || ![Object.prototype, null].includes(Object.getPrototypeOf(item))) throw Error("record_json_required");
    const keys = Object.keys(item).map(key => [key.normalize("NFC"), key]).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
    if (new Set(keys.map(([key]) => key)).size !== keys.length) throw Error("record_normalized_key_collision");
    return `{${keys.map(([key, raw]) => `${JSON.stringify(key)}:${visit(item[raw], depth + 1)}`).join(",")}}`;
  };
  return visit(value, 0);
}

export function otpEvidence(code) {
  if (code !== null && (typeof code !== "string" || code.length > 128)) throw Error("invalid_otp_observation");
  // No code fragments, code length, deterministic hash or derived identifier.
  return { present: code !== null && code.trim().length > 0 };
}

export function expiryEvidence(body, { complete = true } = {}) {
  if (typeof body !== "string" || body.length > 10000 || typeof complete !== "boolean") throw Error("invalid_expiry_observation");
  if (!complete) return { present: null, kind: null };
  if (/\bvalid\s+for\b/iu.test(body)) return { present: true, kind: "valid_for" };
  if (/\bexpir(?:e[sd]?|ing|ation)\b/iu.test(body)) return { present: true, kind: "expiry_word" };
  return { present: false, kind: null };
}

const plain = value => value && typeof value === "object" && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
function fields(value, allowed) {
  if (!plain(value) || Object.keys(value).some(key => !allowed.includes(key))) throw Error("unsafe_record_fields");
}
function optional(value, key, valid) {
  if (Object.hasOwn(value, key) && !valid(value[key])) throw Error("invalid_record_field");
}
const finite = value => typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER;
const count = value => Number.isSafeInteger(value) && value >= 0;
const timestamp = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)
  && Number.isFinite(Date.parse(value));
const email = value => typeof value === "string" && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value);
const failures = ["slo_breach", "auth_fail", "otp_missing", "probe_timeout", "ledger_breach", "flagged", "measurement_error", "ambiguous"];

function validateRecord(record) {
  fields(record, ["schema", "seq", "prev_hash", "round_id", "trigger", "mailbox", "probes", "summary", "verdict", "failures", "sealed_at", "supersedes_breach"]);
  if (!record || record.schema !== "mermail-otp-sentinel/record/v1" || !Number.isSafeInteger(record.seq) || record.seq < 1
      || !HASH.test(record.prev_hash) || record.record_hash !== undefined
      || !id(record.mailbox?.public_id) || !Array.isArray(record.probes) || record.probes.length > 10) throw Error("invalid_record");
  if (record.seq === 1 && record.prev_hash !== GENESIS) throw Error("invalid_genesis");
  optional(record, "round_id", id);
  optional(record, "trigger", value => ["provider-script", "signup-flow"].includes(value));
  optional(record, "sealed_at", timestamp);
  optional(record, "verdict", value => ["PASS", "FAIL"].includes(value));
  optional(record, "failures", value => Array.isArray(value) && value.length <= 10 && value.every(item => failures.includes(item)));
  fields(record.mailbox, ["public_id", "email"]);
  optional(record.mailbox, "email", email);
  if (Object.hasOwn(record, "summary")) {
    fields(record.summary, ["probes_total", "received", "median_ms", "p95_ms", "slo_median_under_30s", "auth_all_pass_or_unverified", "otp_all_present", "expiry_all_present"]);
    for (const key of ["probes_total", "received"]) optional(record.summary, key, value => count(value) && value <= 10);
    for (const key of ["median_ms", "p95_ms"]) optional(record.summary, key, value => value === null || finite(value) && value >= 0);
    for (const key of ["slo_median_under_30s", "auth_all_pass_or_unverified", "otp_all_present", "expiry_all_present"])
      optional(record.summary, key, value => typeof value === "boolean");
  }
  if (Object.hasOwn(record, "supersedes_breach")) {
    fields(record.supersedes_breach, ["record_hash", "round_id"]);
    if (!HASH.test(record.supersedes_breach.record_hash) || !id(record.supersedes_breach.round_id)) throw Error("invalid_breach_reference");
  }
  for (const probe of record.probes) {
    fields(probe, ["provider", "sender", "run_id", "t0", "received_at", "latency_ms", "email_id", "auth", "scan_status", "otp", "expiry_notice", "link_count", "measurement_error"]);
    if (!probe?.otp || Object.keys(probe.otp).length !== 1 || typeof probe.otp.present !== "boolean") throw Error("unsafe_otp_fields");
    fields(probe.otp, ["present"]);
    for (const key of ["provider", "run_id", "email_id"]) optional(probe, key, id);
    optional(probe, "sender", email);
    for (const key of ["t0", "received_at"]) optional(probe, key, value => value === null || timestamp(value));
    optional(probe, "latency_ms", value => value === null || finite(value) && value >= 0);
    optional(probe, "link_count", count);
    optional(probe, "scan_status", value => ["clean", "flagged", "malicious", "skipped", "unknown", "pending", "error"].includes(value));
    if (Object.hasOwn(probe, "auth")) {
      fields(probe.auth, ["status", "spf", "dkim", "dmarc", "inbound_provider", "reason"]);
      for (const key of ["status", "spf", "dkim", "dmarc"]) optional(probe.auth, key, value => ["pass", "fail", "softfail", "unknown"].includes(value));
      optional(probe.auth, "inbound_provider", value => [null, "cloudflare_routing", "resend"].includes(value));
      optional(probe.auth, "reason", value => ["provider_sender_authentication_verdict_unavailable", "inbound_provider_unavailable"].includes(value));
    }
    if (Object.hasOwn(probe, "expiry_notice")) {
      fields(probe.expiry_notice, ["present", "kind"]);
      const {present, kind} = probe.expiry_notice;
      if (!(present === true && ["valid_for", "expiry_word"].includes(kind)
          || (present === false || present === null) && kind === null)) throw Error("unsafe_expiry_fields");
    }
    if (probe.measurement_error !== undefined && probe.measurement_error !== null) {
      fields(probe.measurement_error, ["delta_ms", "reason"]);
      if (!finite(probe.measurement_error.delta_ms) || !["negative_latency", "after_deadline"].includes(probe.measurement_error.reason)) throw Error("invalid_measurement_error");
    }
  }
}

export function sealRecord(record) {
  validateRecord(record);
  const text = canonical(record);
  const record_hash = `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;
  const body = `record_hash ${record_hash}\n${text}`;
  if (body.length > 10000) throw Error("record_body_bound");
  return { record_hash, body };
}

export function verifyPinnedRecord({ anchor, context, metadata, body }) {
  // The caller must obtain anchor from the authenticated user or an explicitly
  // selected private checkpoint produced by its own confirmed save/readback.
  // These checks cannot make mailbox text, a hash or an arbitrary file trusted.
  if (!anchor) return { ok: false, reason: "trusted_checkpoint_required" };
  if (![anchor.workspace_id, anchor.mailbox_id, anchor.draft_id].every(id) || !Number.isSafeInteger(anchor.seq)
      || anchor.seq < 1 || !HASH.test(anchor.record_hash)) return { ok: false, reason: "invalid_checkpoint" };
  if (context?.workspace_id !== anchor.workspace_id || context?.mailbox_id !== anchor.mailbox_id
      || metadata?.id !== anchor.draft_id || metadata?.folder_id !== "draft") return { ok: false, reason: "checkpoint_source_mismatch" };
  if (typeof body !== "string" || body.length > 10000) return { ok: false, reason: "record_body_bound" };
  try {
    const newline = body.indexOf("\n");
    if (newline < 0) throw Error("invalid_record_body");
    const record = JSON.parse(body.slice(newline + 1));
    const sealed = sealRecord(record);
    if (record.mailbox.public_id !== anchor.mailbox_id || record.seq !== anchor.seq
        || body !== sealed.body || sealed.record_hash !== anchor.record_hash) return { ok: false, reason: "checkpoint_record_mismatch" };
    return { ok: true, record_hash: sealed.record_hash, record };
  } catch {
    return { ok: false, reason: "invalid_or_unsafe_record" };
  }
}
