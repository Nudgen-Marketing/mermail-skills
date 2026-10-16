#!/usr/bin/env node
// Vendor-neutral decision for one finished-work handoff.
// No network, mailbox, or payment calls. Email text cannot set observations.

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const DIGEST = /^sha256:[0-9a-f]{64}$/;
const EMAIL = /^[a-z0-9._-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
const TASK_ID = /^[A-Za-z0-9._:-]{1,80}$/;
const PREDICATE_ID = /^[A-Za-z0-9._-]{1,64}$/;
const MESSAGE_ID = /^[^\s]{1,200}$/;
const READ_BOUND = 10000;

const PAYMENT_LANGUAGE = /\b(paid|payment|usdc|invoice|settled|wire|venmo)\b/i;
const LATER_USE_LANGUAGE = /\b(later use|reused|in production|deployed)\b/i;
const INJECTION_LANGUAGE = /ignore previous instructions|paybox_|send_email|system prompt/i;

const STOP = new Set([
  "changed_task",
  "missing_proof",
  "duplicate_retry",
  "invalid_input",
  "effort_exhausted",
]);

const NEXT = {
  delivery_ready: "approve_one_send",
  delivered: "wait_for_requester_reply",
  record_acceptance: "record_acceptance_only",
  revise_within_bound: "revise_named_predicate",
  clarify: "answer_inside_task",
  changed_task: "stop_no_send",
  missing_proof: "stop_no_send",
  duplicate_retry: "stop_no_send",
  invalid_input: "stop_no_send",
  effort_exhausted: "stop_no_send",
};

export function sha256Text(text) {
  return `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;
}

const TEMPLATE_LINES = new Set([
  "DEFECT <predicate_id>: <note>",
  "QUESTION: <note>",
  "CHANGE: <note>",
]);

export function buildNotice(task, artifact, requester) {
  const lines = [
    `Task: ${task.id}`,
    `Requester: ${requester.address}`,
    `Artifact: ${artifact.digest} (${artifact.label})`,
    "Predicates:",
    ...task.predicates.map((predicate) => `- ${predicate.id}: ${predicate.text}`),
    "This message records delivery only. It is not acceptance, payment, or later use.",
    "Reply with exactly one marker line:",
    `ACCEPT ${artifact.digest}`,
    "DEFECT <predicate_id>: <note>",
    "QUESTION: <note>",
    "CHANGE: <note>",
  ];
  const body = `${lines.join("\n")}\n`;
  return {
    subject: `Work delivery ${task.id} ${artifact.digest}`,
    body,
    notice_digest: sha256Text(body),
    to: requester.address,
  };
}

function markerLike(text) {
  return /^(?:>+\s*)?(ACCEPT|DEFECT|QUESTION|CHANGE)\b/m.test(text);
}

// The notice teaches the reply syntax. Those lines, and any '>' quote, are not the requester's answer.
export function separateAuthoredReply(text, packet) {
  const notice = buildNotice(packet.task, packet.artifact, packet.requester).body.replace(/\r\n/g, "\n").trim();
  const templateBlock = [
    "Reply with exactly one marker line:",
    `ACCEPT ${packet.artifact.digest}`,
    "DEFECT <predicate_id>: <note>",
    "QUESTION: <note>",
    "CHANGE: <note>",
  ].join("\n");
  const markerBlock = templateBlock.split("\n").slice(1).join("\n");
  let working = String(text).replace(/\r\n/g, "\n");
  const original = working;
  if (notice && working.includes(notice)) working = working.split(notice).join("\n");
  if (working.includes(templateBlock)) working = working.split(templateBlock).join("\n");
  if (working.includes(markerBlock)) working = working.split(markerBlock).join("\n");
  const kept = [];
  for (const raw of working.split("\n")) {
    const trimmed = raw.trim();
    if (/^>+/.test(trimmed)) continue;
    if (TEMPLATE_LINES.has(trimmed)) continue;
    kept.push(raw);
  }
  const authored = kept.join("\n");
  return {
    text: authored,
    removedMarkerLike: markerLike(original) && !markerLike(authored),
  };
}

export function decide(packet) {
  const warnings = [];
  const problem = validate(packet);
  if (problem) return result("invalid_input", problem, observations(), warnings);

  const prior = normalizePrior(packet.prior);
  const evidence = packet.operator_evidence ?? null;

  if (packet.reply && prior.reply_message_ids.includes(packet.reply.message_id)) {
    return applyOperator(
      result("duplicate_retry", "reply_already_recorded", observations(), warnings),
      evidence,
      warnings,
    );
  }
  if (
    packet.intent === "prepare" &&
    prior.artifact_digests_delivered.includes(packet.artifact.digest)
  ) {
    return applyOperator(
      result("duplicate_retry", "artifact_already_delivered", observations(), warnings),
      evidence,
      warnings,
    );
  }
  if (packet.intent === "record" && !packet.delivery) {
    return applyOperator(
      result("missing_proof", "delivery_not_observed", observations(), warnings),
      evidence,
      warnings,
    );
  }
  if (packet.intent === "record" && packet.delivery) {
    const knownDelivery = prior.delivery_message_ids.includes(packet.delivery.message_id);
    const knownDigest = prior.artifact_digests_delivered.includes(packet.artifact.digest);
    if (!packet.reply && (knownDelivery || knownDigest)) {
      return applyOperator(
        result(
          "duplicate_retry",
          knownDelivery ? "delivery_already_recorded" : "artifact_already_delivered",
          observations(),
          warnings,
        ),
        evidence,
        warnings,
      );
    }
    const coverage = deliveryCoverageProblem(packet);
    if (coverage) {
      return applyOperator(
        result("missing_proof", coverage, observations(), warnings),
        evidence,
        warnings,
      );
    }
  }

  if (packet.intent === "prepare") {
    return applyOperator(
      result(
        "delivery_ready",
        "notice_prepared",
        observations(),
        warnings,
        { notice: buildNotice(packet.task, packet.artifact, packet.requester) },
      ),
      evidence,
      warnings,
    );
  }

  if (!packet.reply) {
    return applyOperator(
      result("delivered", "delivery_recorded", observations({ delivery: true }), warnings, {
        detail: { delivery_message_id: packet.delivery.message_id },
      }),
      evidence,
      warnings,
    );
  }

  const delivered = observations({ delivery: true });
  const folderProblem = inboundFolderProblem(packet.reply);
  if (folderProblem) {
    return applyOperator(
      result("missing_proof", folderProblem, delivered, warnings),
      evidence,
      warnings,
    );
  }
  if (
    packet.mailbox_id &&
    packet.reply.mailbox_id &&
    packet.mailbox_id !== packet.reply.mailbox_id
  ) {
    return applyOperator(
      result("missing_proof", "mailbox_mismatch", delivered, warnings),
      evidence,
      warnings,
    );
  }
  if (packet.reply.scan_status !== "clean") {
    return applyOperator(
      result("missing_proof", "scan_not_clean", delivered, warnings),
      evidence,
      warnings,
    );
  }
  if (extractEmail(packet.reply.from) !== packet.requester.address.toLowerCase()) {
    return applyOperator(
      result("missing_proof", "sender_mismatch", delivered, warnings),
      evidence,
      warnings,
    );
  }
  if (authStatus(packet.reply) !== "pass") {
    collectTextWarnings(packet.reply.text, warnings);
    return applyOperator(
      result("missing_proof", "sender_not_authenticated", delivered, warnings),
      evidence,
      warnings,
    );
  }
  if (packet.reply.text.length > READ_BOUND) {
    return applyOperator(
      result("missing_proof", "read_bound_exceeded", delivered, warnings),
      evidence,
      warnings,
    );
  }

  collectTextWarnings(packet.reply.text, warnings);
  const separated = separateAuthoredReply(packet.reply.text, packet);
  const parsed = parseMarkers(separated.text);
  if (!parsed.error && parsed.markers.length === 0 && separated.removedMarkerLike) {
    return applyOperator(
      result("missing_proof", "quoted_template_not_answer", delivered, warnings),
      evidence,
      warnings,
    );
  }
  if (parsed.error) {
    return applyOperator(
      result("invalid_input", parsed.error, delivered, warnings),
      evidence,
      warnings,
    );
  }
  if (parsed.markers.length === 0) {
    const claimed = warnings.some((warning) =>
      warning === "email_payment_language" || warning === "email_later_use_language",
    );
    return applyOperator(
      result(
        "missing_proof",
        claimed ? "email_cannot_prove_payment_or_use" : "reply_not_classified",
        delivered,
        warnings,
      ),
      evidence,
      warnings,
    );
  }
  if (parsed.markers.length > 1) {
    return applyOperator(
      result("invalid_input", "contradictory_markers", delivered, warnings),
      evidence,
      warnings,
    );
  }

  const marker = parsed.markers[0];
  if (marker.kind === "accept") {
    if (marker.digest !== packet.artifact.digest) {
      return applyOperator(
        result("missing_proof", "digest_mismatch", delivered, warnings),
        evidence,
        warnings,
      );
    }
    return applyOperator(
      result("record_acceptance", "accept_marker", observations({
        delivery: true,
        acceptance: true,
      }), warnings, {
        detail: { delivery_message_id: packet.delivery.message_id, reply_message_id: packet.reply.message_id },
      }),
      evidence,
      warnings,
    );
  }
  if (marker.kind === "question") {
    return applyOperator(
      result("clarify", "question_marker", delivered, warnings, {
        detail: { note: marker.note },
      }),
      evidence,
      warnings,
    );
  }
  if (marker.kind === "change") {
    return applyOperator(
      result("changed_task", "change_marker", delivered, warnings, {
        detail: { note: marker.note },
      }),
      evidence,
      warnings,
    );
  }
  return applyOperator(defectDecision(packet, prior, marker, delivered, warnings), evidence, warnings);
}

function defectDecision(packet, prior, marker, delivered, warnings) {
  const known = packet.task.predicates.some((predicate) => predicate.id === marker.predicateId);
  const allowed = packet.task.effort.revision_predicate_ids.includes(marker.predicateId);
  const detail = { predicate_id: marker.predicateId, note: marker.note };
  if (!known) {
    return result("changed_task", "defect_unknown_predicate", delivered, warnings, { detail });
  }
  if (!allowed) {
    return result("changed_task", "defect_outside_revision_set", delivered, warnings, { detail });
  }
  if (prior.revisions_used >= packet.task.effort.max_revisions) {
    return result("effort_exhausted", "revision_budget_spent", delivered, warnings, {
      detail: {
        ...detail,
        revisions_used: prior.revisions_used,
        max_revisions: packet.task.effort.max_revisions,
      },
    });
  }
  return result("revise_within_bound", "defect_inside_bound", delivered, warnings, {
    detail: {
      ...detail,
      revisions_used_after: prior.revisions_used + 1,
      revisions_remaining_after: packet.task.effort.max_revisions - prior.revisions_used - 1,
    },
  });
}

function result(disposition, reason, observationsValue, warnings, extra = {}) {
  return {
    disposition,
    reason,
    observations: observationsValue,
    warnings: [...warnings],
    notice: extra.notice ?? null,
    next_action: NEXT[disposition],
    detail: extra.detail ?? {},
    effects: [],
  };
}

function observations({ delivery = false, acceptance = false, payment = false, later_use = false } = {}) {
  return { delivery, acceptance, payment, later_use };
}

function applyOperator(decision, evidence, warnings) {
  // A reference is a report. This package has no PayBox or later-use observation channel.
  decision.observations = { ...decision.observations, payment: false, later_use: false };
  if (!evidence || (evidence.payment == null && evidence.later_use == null)) return decision;
  if (STOP.has(decision.disposition)) {
    if (!decision.warnings.includes("operator_evidence_not_applied")) {
      decision.warnings.push("operator_evidence_not_applied");
    }
    return decision;
  }
  const assertions = {};
  if (evidence.payment) assertions.payment = reportedAssertion(evidence.payment);
  if (evidence.later_use) assertions.later_use = reportedAssertion(evidence.later_use);
  decision.detail = { ...decision.detail, operator_assertions: assertions };
  if (!decision.warnings.includes("operator_evidence_unverified")) {
    decision.warnings.push("operator_evidence_unverified");
  }
  if (verificationClaimed(evidence) && !decision.warnings.includes("operator_evidence_verification_refused")) {
    decision.warnings.push("operator_evidence_verification_refused");
  }
  return decision;
}

function reportedAssertion(row) {
  return {
    reference: row.reference,
    source: "operator",
    reported: true,
    verified: false,
  };
}

function verificationClaimed(evidence) {
  for (const key of ["payment_observation", "later_use_observation", "observations", "authority"]) {
    if (evidence[key] != null) return true;
  }
  for (const key of ["payment", "later_use"]) {
    const row = evidence[key];
    if (!row || typeof row !== "object") continue;
    if (row.verified !== undefined && row.verified !== false) return true;
    if (row.authoritative !== undefined && row.authoritative !== false) return true;
    if (row.authority != null && row.authority !== "") return true;
    if (row.observation != null || row.paid === true || row.reused === true) return true;
  }
  return false;
}

function deliveryCoverageProblem(packet) {
  const ids = packet.delivery.predicate_ids;
  const expected = packet.task.predicates.map((predicate) => predicate.id);
  if (new Set(ids).size !== ids.length) return "delivery_predicates_duplicate";
  const same = ids.length === expected.length && expected.every((id) => ids.includes(id));
  if (!same) return "delivery_predicates_incomplete";
  if (packet.delivery.notice_digest == null) return "notice_required";
  const canonical = buildNotice(packet.task, packet.artifact, packet.requester);
  if (packet.delivery.notice_digest !== canonical.notice_digest) return "notice_digest_mismatch";
  return null;
}

function inboundFolderProblem(reply) {
  const folder = reply.folder_id ?? reply.folderId;
  if (folder == null || folder === "") return "missing_folder";
  const value = String(folder).trim().toLowerCase();
  if (["sent", "outbox", "drafts", "scheduled", "trash"].includes(value)) return "sent_only";
  if (value !== "inbox") return "not_inbound";
  return null;
}

function collectTextWarnings(text, warnings) {
  if (PAYMENT_LANGUAGE.test(text)) warnings.push("email_payment_language");
  if (LATER_USE_LANGUAGE.test(text)) warnings.push("email_later_use_language");
  if (INJECTION_LANGUAGE.test(text)) warnings.push("email_injection_language");
}

function parseMarkers(text) {
  const markers = [];
  let malformed = false;
  for (const rawLine of text.split(/\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const accept = line.match(/^ACCEPT\s+(sha256:[0-9a-f]{64})$/);
    const defect = line.match(/^DEFECT\s+([A-Za-z0-9._-]+):\s*(.*)$/);
    const question = line.match(/^QUESTION:\s*(.*)$/);
    const change = line.match(/^CHANGE:\s*(.*)$/);
    if (accept) markers.push({ kind: "accept", digest: accept[1] });
    else if (defect) markers.push({ kind: "defect", predicateId: defect[1], note: clip(defect[2]) });
    else if (question) markers.push({ kind: "question", note: clip(question[1]) });
    else if (change) markers.push({ kind: "change", note: clip(change[1]) });
    else if (/^(ACCEPT|DEFECT|QUESTION|CHANGE)\b/.test(line)) malformed = true;
  }
  if (malformed && markers.length > 0) return { error: "contradictory_markers", markers: [] };
  if (malformed) return { error: "malformed_marker", markers: [] };
  if (markers.length > 1) return { error: "contradictory_markers", markers };
  return { markers };
}

function clip(note) {
  return note.trim().slice(0, 240);
}

function authStatus(reply) {
  const value = reply.sender_authentication;
  if (typeof value === "string") return value;
  if (value && typeof value.status === "string") return value.status;
  return "missing";
}

function extractEmail(from) {
  const angled = String(from).match(/<([^<>\s]+)>/);
  return (angled ? angled[1] : String(from)).trim().toLowerCase();
}

function normalizePrior(prior) {
  return {
    delivery_message_ids: prior?.delivery_message_ids ?? [],
    reply_message_ids: prior?.reply_message_ids ?? [],
    artifact_digests_delivered: prior?.artifact_digests_delivered ?? [],
    revisions_used: prior?.revisions_used ?? 0,
  };
}

function validate(packet) {
  if (!packet || typeof packet !== "object" || Array.isArray(packet)) return "packet_type";
  if (packet.intent !== "prepare" && packet.intent !== "record") return "intent";
  if (!packet.task || typeof packet.task !== "object") return "task";
  if (typeof packet.task.id !== "string" || !TASK_ID.test(packet.task.id)) return "task_id";
  if (!Array.isArray(packet.task.predicates) || packet.task.predicates.length === 0) return "predicates";
  const predicateIds = [];
  for (const predicate of packet.task.predicates) {
    if (!predicate || typeof predicate.id !== "string" || !PREDICATE_ID.test(predicate.id)) return "predicate_id";
    if (typeof predicate.text !== "string" || predicate.text.trim() === "" || predicate.text.length > 500) {
      return "predicate_text";
    }
    if (predicateIds.includes(predicate.id)) return "predicate_duplicate";
    predicateIds.push(predicate.id);
  }
  const effort = packet.task.effort;
  if (!effort || typeof effort !== "object") return "effort";
  if (!Number.isInteger(effort.max_revisions) || effort.max_revisions < 0 || effort.max_revisions > 100) {
    return "max_revisions";
  }
  if (!Array.isArray(effort.revision_predicate_ids)) return "revision_predicate_ids";
  for (const id of effort.revision_predicate_ids) {
    if (!predicateIds.includes(id) || effort.revision_predicate_ids.indexOf(id) !== effort.revision_predicate_ids.lastIndexOf(id)) {
      return "revision_predicate_ids";
    }
  }
  if (!packet.artifact || !DIGEST.test(packet.artifact.digest ?? "")) return "artifact_digest";
  if (typeof packet.artifact.label !== "string" || packet.artifact.label.trim() === "" || packet.artifact.label.length > 120) {
    return "artifact_label";
  }
  if (!packet.requester || typeof packet.requester.address !== "string" || !EMAIL.test(packet.requester.address)) {
    return "requester_address";
  }
  const priorProblem = validatePrior(packet.prior);
  if (priorProblem) return priorProblem;
  const evidenceProblem = validateEvidence(packet.operator_evidence);
  if (evidenceProblem) return evidenceProblem;
  if (packet.intent === "prepare" && (packet.delivery != null || packet.reply != null)) {
    return "prepare_has_delivery_or_reply";
  }
  if (packet.delivery != null) {
    const deliveryProblem = validateDelivery(packet.delivery, packet, predicateIds);
    if (deliveryProblem) return deliveryProblem;
  }
  if (packet.reply != null) {
    const replyProblem = validateReply(packet.reply);
    if (replyProblem) return replyProblem;
    if (packet.delivery && packet.reply.message_id === packet.delivery.message_id) {
      return "reply_reuses_delivery_id";
    }
  }
  return null;
}

function validatePrior(prior) {
  if (prior == null) return null;
  if (typeof prior !== "object" || Array.isArray(prior)) return "prior";
  for (const key of ["delivery_message_ids", "reply_message_ids", "artifact_digests_delivered"]) {
    if (prior[key] == null) continue;
    if (!Array.isArray(prior[key]) || prior[key].some((item) => typeof item !== "string" || item.length === 0 || item.length > 200)) {
      return "prior";
    }
  }
  if (prior.revisions_used != null && (!Number.isInteger(prior.revisions_used) || prior.revisions_used < 0)) {
    return "revisions_used";
  }
  return null;
}

function validateEvidence(evidence) {
  if (evidence == null) return null;
  if (typeof evidence !== "object" || Array.isArray(evidence)) return "operator_evidence_type";
  for (const key of ["payment", "later_use"]) {
    if (evidence[key] == null) continue;
    const row = evidence[key];
    if (typeof row !== "object" || Array.isArray(row)) return "operator_evidence_type";
    if (row.source !== "operator") return "operator_evidence_source";
    if (typeof row.reference !== "string" || row.reference.trim() === "" || row.reference.length > 200) {
      return "operator_evidence_reference";
    }
  }
  return null;
}

function validateDelivery(delivery, packet, predicateIds) {
  if (typeof delivery !== "object" || Array.isArray(delivery)) return "delivery";
  if (typeof delivery.message_id !== "string" || !MESSAGE_ID.test(delivery.message_id)) return "delivery_message_id";
  if (delivery.artifact_digest !== packet.artifact.digest) return "delivery_digest_mismatch";
  if (!Array.isArray(delivery.predicate_ids) || delivery.predicate_ids.length === 0) return "delivery_predicate_ids";
  for (const id of delivery.predicate_ids) {
    if (!predicateIds.includes(id)) return "delivery_predicate_ids";
  }
  if (delivery.notice_digest != null && !DIGEST.test(delivery.notice_digest)) return "notice_digest";
  return null;
}

function validateReply(reply) {
  if (typeof reply !== "object" || Array.isArray(reply)) return "reply";
  if (typeof reply.message_id !== "string" || !MESSAGE_ID.test(reply.message_id)) return "reply_message_id";
  if (typeof reply.from !== "string" || reply.from.trim() === "" || reply.from.length > 300) return "reply_from";
  if (typeof reply.text !== "string") return "reply_text";
  const status = authStatus(reply);
  if (!["pass", "unknown", "fail", "missing"].includes(status)) return "sender_authentication";
  if (reply.scan_status != null && typeof reply.scan_status !== "string") return "scan_status";
  return null;
}

export function exitCodeFor(decision) {
  return STOP.has(decision.disposition) ? 2 : 0;
}

export async function runCli(argv, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  if (argv.length !== 1) {
    stderr.write("usage: node bin/decide.mjs <packet.json|->\n");
    return 1;
  }
  let raw;
  try {
    raw = argv[0] === "-"
      ? await readStdin(io.stdin ?? process.stdin)
      : await readFile(argv[0], "utf8");
  } catch (error) {
    stderr.write(`read_failed: ${error.code ?? "error"}\n`);
    return 1;
  }
  let packet;
  try {
    packet = JSON.parse(raw);
  } catch {
    const decision = result("invalid_input", "packet_not_json", observations(), []);
    stdout.write(`${JSON.stringify(decision, null, 2)}\n`);
    return 2;
  }
  const decision = decide(packet);
  stdout.write(`${JSON.stringify(decision, null, 2)}\n`);
  return exitCodeFor(decision);
}

function readStdin(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    stream.on("error", reject);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await runCli(process.argv.slice(2)));
}
