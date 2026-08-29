#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const CHANGE_KINDS = new Set([
  "addition",
  "modification",
  "removal",
  "deadline_change",
  "acceptance_change",
  "contradiction",
  "clarification",
  "ambiguous",
]);

const IMPACT_KINDS = new Set([
  "addition",
  "modification",
  "removal",
  "deadline_change",
  "acceptance_change",
  "contradiction",
]);

const ITEM_REQUIRED_KINDS = new Set(["modification", "removal", "contradiction"]);
const CONFIDENCE = new Set(["high", "medium", "low"]);
const ESTIMATE_SOURCES = new Set(["user_supplied", "agent_preliminary"]);
const BASELINE_SOURCE_TYPES = new Set(["message", "user_supplied_brief", "structured_scope"]);
const IMPACT_LEVELS = new Set(["low", "medium", "high"]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value, label, max = 10000) {
  assert(typeof value === "string" && value.trim().length > 0, `${label} must be a non-empty string`);
  assert(value.length <= max, `${label} exceeds ${max} characters`);
  return value.trim();
}

function optionalFiniteNumber(value, label, { min = 0, max = 1_000_000 } = {}) {
  if (value === null || value === undefined) return null;
  assert(Number.isFinite(value), `${label} must be a finite number or null`);
  assert(value >= min && value <= max, `${label} must be between ${min} and ${max}`);
  return value;
}

function normalizeEvidence(value) {
  return value.toLocaleLowerCase("en-US").replace(/\s+/g, " ").trim();
}

function newlyAuthoredExcerpt(value) {
  const lines = value.replace(/\r\n?/g, "\n").split("\n");
  const authored = [];
  const quoteMarker = /^(?:\s*>|\s*On .+wrote:\s*$|\s*-{2,}\s*(?:Original Message|Forwarded message)\s*-{2,}\s*$|\s*_{5,}\s*$|\s*(?:From|Sent|To|Subject):\s+.+$)/i;
  for (const line of lines) {
    if (quoteMarker.test(line) && authored.some((item) => item.trim().length > 0)) break;
    if (quoteMarker.test(line)) continue;
    authored.push(line);
  }
  return authored.join("\n").trim();
}

function validateStringArray(value, label, maxItems = 50) {
  assert(Array.isArray(value), `${label} must be an array`);
  assert(value.length <= maxItems, `${label} exceeds ${maxItems} items`);
  return value.map((item, index) => nonEmptyString(item, `${label}[${index}]`, 1000));
}

function optionalIsoTimestamp(value, label) {
  if (value === null || value === undefined) return null;
  const timestamp = nonEmptyString(value, label, 80);
  assert(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp),
    `${label} must be an ISO 8601 timestamp with timezone`,
  );
  assert(Number.isFinite(Date.parse(timestamp)), `${label} must be a valid timestamp`);
  return timestamp;
}

function safePlainText(value) {
  return String(value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function markdownInline(value) {
  return safePlainText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/([\\`*_{}\[\]()#+!|])/g, "\\$1");
}

export function validateInput(input) {
  assert(isPlainObject(input), "input must be a JSON object");
  assert(input.schema_version === "1.0", "schema_version must be 1.0");
  assert(isPlainObject(input.project), "project must be an object");
  assert(isPlainObject(input.baseline), "baseline must be an object");
  assert(Array.isArray(input.later_messages), "later_messages must be an array");
  assert(input.later_messages.length <= 8, "later_messages exceeds the eight-message review budget");

  const project = {
    name: nonEmptyString(input.project.name, "project.name", 200),
    client_name: input.project.client_name
      ? nonEmptyString(input.project.client_name, "project.client_name", 200)
      : "Client",
    user_confirmed_recipient: input.project.user_confirmed_recipient
      ? nonEmptyString(input.project.user_confirmed_recipient, "project.user_confirmed_recipient", 320)
      : null,
    recipient_source: input.project.recipient_source
      ? nonEmptyString(input.project.recipient_source, "project.recipient_source", 80)
      : null,
    currency: input.project.currency
      ? nonEmptyString(input.project.currency, "project.currency", 12).toUpperCase()
      : null,
    hourly_rate: optionalFiniteNumber(input.project.hourly_rate, "project.hourly_rate"),
  };

  if (project.user_confirmed_recipient) {
    assert(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(project.user_confirmed_recipient), "user_confirmed_recipient must be an email address");
    assert(
      project.recipient_source === "user_supplied_current_request",
      "user_confirmed_recipient requires recipient_source=user_supplied_current_request",
    );
  } else {
    assert(project.recipient_source === null, "recipient_source requires user_confirmed_recipient");
  }
  if (project.currency) {
    assert(/^[A-Z]{3,6}$/.test(project.currency), "project.currency must be a 3-6 letter currency code");
  }

  const baselineItems = input.baseline.deliverables;
  assert(Array.isArray(baselineItems) && baselineItems.length > 0, "baseline.deliverables must contain at least one item");
  assert(baselineItems.length <= 50, "baseline.deliverables exceeds 50 items");
  const itemIds = new Set();
  const deliverables = baselineItems.map((item, index) => {
    assert(isPlainObject(item), `baseline.deliverables[${index}] must be an object`);
    const id = nonEmptyString(item.id, `baseline.deliverables[${index}].id`, 80);
    assert(!itemIds.has(id), `duplicate baseline deliverable id: ${id}`);
    itemIds.add(id);
    return { id, text: nonEmptyString(item.text, `baseline.deliverables[${index}].text`, 1000) };
  });

  const source_type = nonEmptyString(input.baseline.source_type, "baseline.source_type", 80);
  assert(BASELINE_SOURCE_TYPES.has(source_type), "baseline.source_type is invalid");
  const source_message_id = input.baseline.source_message_id === null || input.baseline.source_message_id === undefined
    ? null
    : nonEmptyString(input.baseline.source_message_id, "baseline.source_message_id", 200);
  if (source_type === "message") {
    assert(source_message_id !== null, "message baseline requires source_message_id");
  } else {
    assert(source_message_id === null, `${source_type} baseline must not set source_message_id`);
  }
  const baseline_scan_status = input.baseline.scan_status ?? null;
  const baseline_body_excerpt = input.baseline.body_excerpt === null || input.baseline.body_excerpt === undefined
    ? null
    : nonEmptyString(input.baseline.body_excerpt, "baseline.body_excerpt", 10000);
  if (source_type === "message") {
    assert(baseline_scan_status === "clean", "message baseline requires scan_status=clean");
    assert(baseline_body_excerpt !== null, "message baseline requires body_excerpt");
  } else {
    assert(baseline_scan_status === null, `${source_type} baseline must not set scan_status`);
    assert(baseline_body_excerpt === null, `${source_type} baseline must not set body_excerpt`);
  }

  const baseline = {
    source_type,
    source_message_id,
    scan_status: baseline_scan_status,
    body_excerpt: baseline_body_excerpt,
    approved_at: optionalIsoTimestamp(input.baseline.approved_at, "baseline.approved_at"),
    deadline: input.baseline.deadline ? nonEmptyString(input.baseline.deadline, "baseline.deadline", 80) : null,
    fixed_amount: optionalFiniteNumber(input.baseline.fixed_amount, "baseline.fixed_amount"),
    deliverables,
    exclusions: validateStringArray(input.baseline.exclusions ?? [], "baseline.exclusions"),
    acceptance_criteria: validateStringArray(
      input.baseline.acceptance_criteria ?? [],
      "baseline.acceptance_criteria",
    ),
  };
  if (project.hourly_rate !== null || baseline.fixed_amount !== null) {
    assert(project.currency !== null, "monetary inputs require project.currency");
  }
  if (baseline.source_type === "message") {
    const normalizedBaselineBody = normalizeEvidence(baseline.body_excerpt);
    const requireBaselineGrounding = (value, label) => {
      assert(
        normalizedBaselineBody.includes(normalizeEvidence(String(value))),
        `${label} is not grounded in baseline.body_excerpt`,
      );
    };
    for (const item of baseline.deliverables) {
      requireBaselineGrounding(item.text, `baseline deliverable ${item.id}`);
    }
    for (const [index, item] of baseline.exclusions.entries()) {
      requireBaselineGrounding(item, `baseline.exclusions[${index}]`);
    }
    for (const [index, item] of baseline.acceptance_criteria.entries()) {
      requireBaselineGrounding(item, `baseline.acceptance_criteria[${index}]`);
    }
    if (baseline.deadline !== null) requireBaselineGrounding(baseline.deadline, "baseline.deadline");
    if (baseline.fixed_amount !== null) {
      requireBaselineGrounding(baseline.fixed_amount, "baseline.fixed_amount");
      requireBaselineGrounding(project.currency, "project.currency for baseline.fixed_amount");
    }
  }

  const messageIds = new Set();
  let totalChars = 0;
  const later_messages = input.later_messages.map((message, messageIndex) => {
    assert(isPlainObject(message), `later_messages[${messageIndex}] must be an object`);
    const id = nonEmptyString(message.id, `later_messages[${messageIndex}].id`, 200);
    assert(!messageIds.has(id), `duplicate later message id: ${id}`);
    if (baseline.source_message_id !== null) {
      assert(id !== baseline.source_message_id, "a later message cannot reuse the baseline message id");
    }
    messageIds.add(id);
    assert(message.scan_status === "clean", `${id} is not clean; keep it metadata-only and exclude it`);
    const body_excerpt = nonEmptyString(message.body_excerpt, `${id}.body_excerpt`, 10000);
    totalChars += body_excerpt.length;
    assert(totalChars <= 50000, "selected message bodies exceed the 50,000-character review budget");
    assert(Array.isArray(message.observations), `${id}.observations must be an array`);
    assert(message.observations.length <= 20, `${id}.observations exceeds 20 items`);
    const authored_excerpt = newlyAuthoredExcerpt(body_excerpt);
    assert(authored_excerpt.length > 0, `${id} has no newly authored content after quoted history is removed`);
    const normalizedBody = normalizeEvidence(authored_excerpt);
    const observations = message.observations.map((observation, observationIndex) => {
      assert(isPlainObject(observation), `${id}.observations[${observationIndex}] must be an object`);
      assert(CHANGE_KINDS.has(observation.kind), `${id}.observations[${observationIndex}].kind is invalid`);
      const baseline_item_id = observation.baseline_item_id ?? null;
      if (baseline_item_id !== null) {
        nonEmptyString(baseline_item_id, `${id}.observations[${observationIndex}].baseline_item_id`, 80);
        assert(itemIds.has(baseline_item_id), `${id} references unknown baseline item ${baseline_item_id}`);
      }
      if (ITEM_REQUIRED_KINDS.has(observation.kind)) {
        assert(baseline_item_id !== null, `${id} ${observation.kind} must reference a baseline item`);
      }
      const evidence_quote = nonEmptyString(
        observation.evidence_quote,
        `${id}.observations[${observationIndex}].evidence_quote`,
        500,
      );
      assert(
        normalizedBody.includes(normalizeEvidence(evidence_quote)),
        `${id} evidence quote is not grounded in body_excerpt`,
      );
      const estimated_hours = optionalFiniteNumber(
        observation.estimated_hours,
        `${id}.observations[${observationIndex}].estimated_hours`,
        { min: 0, max: 1000 },
      );
      const estimate_source = observation.estimate_source ?? null;
      if (estimated_hours !== null) {
        assert(ESTIMATE_SOURCES.has(estimate_source), `${id} estimated_hours requires a valid estimate_source`);
      } else {
        assert(estimate_source === null, `${id} estimate_source requires estimated_hours`);
      }
      assert(CONFIDENCE.has(observation.confidence), `${id} observation confidence is invalid`);
      const impact_level = observation.impact_level ?? null;
      if (impact_level !== null) {
        assert(IMPACT_LEVELS.has(impact_level), `${id} observation impact_level is invalid`);
      }
      if (observation.kind === "ambiguous") {
        assert(impact_level !== null, `${id} ambiguous observation requires impact_level`);
      }
      return {
        kind: observation.kind,
        baseline_item_id,
        requested_text: nonEmptyString(
          observation.requested_text,
          `${id}.observations[${observationIndex}].requested_text`,
          1000,
        ),
        evidence_quote,
        estimated_hours,
        estimate_source,
        confidence: observation.confidence,
        impact_level,
      };
    });
    const received_at = optionalIsoTimestamp(message.received_at, `${id}.received_at`);
    if (baseline.approved_at !== null) {
      assert(received_at !== null, `${id}.received_at is required when baseline.approved_at is set`);
      assert(
        Date.parse(received_at) > Date.parse(baseline.approved_at),
        `${id}.received_at must be after baseline.approved_at`,
      );
    }
    return {
      id,
      received_at,
      sender: message.sender ? nonEmptyString(message.sender, `${id}.sender`, 320) : null,
      scan_status: "clean",
      body_excerpt,
      authored_excerpt,
      observations,
    };
  });

  return { schema_version: "1.0", project, baseline, later_messages };
}

function recommendationFor(changes) {
  if (changes.some((change) => change.kind === "contradiction" || (change.kind === "ambiguous" && change.impact_level === "high"))) {
    return "NEEDS_ESCALATION";
  }
  if (changes.some((change) => IMPACT_KINDS.has(change.kind))) return "NEEDS_CHANGE_ORDER";
  if (changes.some((change) => change.kind === "ambiguous")) return "NEEDS_CLARIFICATION";
  return "NO_CONFIRMED_SCOPE_CHANGE";
}

function severityFor(change) {
  if (change.kind === "contradiction" || change.kind === "deadline_change") return "high";
  if (change.kind === "addition" || change.kind === "acceptance_change") return "medium";
  if (change.kind === "ambiguous") {
    return change.impact_level === "high" ? "high" : "needs_clarification";
  }
  return "low";
}

function money(value, currency) {
  if (value === null || value === undefined || !currency) return null;
  return `${value.toFixed(2)} ${currency}`;
}

function baselineReference(baseline) {
  if (baseline.source_type === "message") return `message ${safePlainText(baseline.source_message_id)}`;
  if (baseline.source_type === "user_supplied_brief") return "the user-selected brief";
  return "the user-selected structured scope";
}

function effortLabel(change) {
  if (change.estimated_hours === null) return "impact to be estimated";
  if (change.estimate_source === "user_supplied") {
    return `user-supplied estimate: ${change.estimated_hours} hours`;
  }
  return `preliminary agent estimate: ${change.estimated_hours} hours`;
}

function buildDraft(normalized, register, totals, recommendation) {
  if (recommendation === "NO_CONFIRMED_SCOPE_CHANGE") return null;
  const project = normalized.project;
  const baseline = normalized.baseline;
  const lines = [
    `Hello ${safePlainText(project.client_name)},`,
    "",
    `I reviewed the recent requests for ${safePlainText(project.name)} against ${baselineReference(baseline)}.`,
    "",
    "Items needing written confirmation:",
  ];
  for (const change of register.filter((item) => item.kind !== "clarification")) {
    const hours = effortLabel(change);
    lines.push(`- [${change.kind}] ${safePlainText(change.evidence_quote)} (${hours}; source: ${safePlainText(change.message_id)})`);
  }
  lines.push("");
  if (totals.user_supplied_hours !== null) {
    lines.push(`User-supplied effort: ${totals.user_supplied_hours} hours.`);
  }
  if (totals.preliminary_hours !== null) {
    lines.push(`Preliminary agent-estimated effort: ${totals.preliminary_hours} hours.`);
  }
  if (totals.user_supplied_amount_display) {
    lines.push(`Amount from user-supplied effort at the supplied rate: ${totals.user_supplied_amount_display}.`);
  }
  if (totals.preliminary_amount_display) {
    lines.push(`Preliminary amount from agent-estimated effort at the supplied rate: ${totals.preliminary_amount_display}.`);
  }
  if (totals.user_supplied_hours !== null && totals.preliminary_hours !== null) {
    lines.push(`Combined arithmetic total: ${totals.estimated_hours} hours (${totals.preliminary_hours} hours are preliminary).`);
  }
  lines.push(
    "",
    "Please confirm one of these options:",
    "1. Approve a written change order after effort, price, and schedule are finalized.",
    "2. Keep the original scope, price, and deadline unchanged.",
    "3. Schedule a discussion to resolve the open items.",
    "",
    "No requested change is accepted until it is confirmed in writing.",
  );
  return {
    to: project.user_confirmed_recipient,
    subject: `[Scope review] ${safePlainText(project.name)} — changes need confirmation`,
    body_text: lines.join("\n"),
    state: "draft_prepared",
  };
}

export function analyzeScopeChanges(input) {
  const normalized = validateInput(input);
  const register = [];
  for (const message of normalized.later_messages) {
    for (const observation of message.observations) {
      register.push({
        ...observation,
        message_id: message.id,
        received_at: message.received_at,
        severity: severityFor(observation),
      });
    }
  }
  register.sort((a, b) => `${a.received_at ?? ""}:${a.message_id}`.localeCompare(`${b.received_at ?? ""}:${b.message_id}`));

  const estimated = register.filter(
    (change) => IMPACT_KINDS.has(change.kind) && change.estimated_hours !== null,
  );
  const estimated_hours = estimated.length > 0
    ? Number(estimated.reduce((sum, change) => sum + change.estimated_hours, 0).toFixed(2))
    : null;
  const sumHoursBySource = (source) => {
    const selected = estimated.filter((change) => change.estimate_source === source);
    return selected.length > 0
      ? Number(selected.reduce((sum, change) => sum + change.estimated_hours, 0).toFixed(2))
      : null;
  };
  const user_supplied_hours = sumHoursBySource("user_supplied");
  const preliminary_hours = sumHoursBySource("agent_preliminary");
  const estimated_amount = estimated_hours !== null && normalized.project.hourly_rate !== null
    ? Number((estimated_hours * normalized.project.hourly_rate).toFixed(2))
    : null;
  const user_supplied_amount = user_supplied_hours !== null && normalized.project.hourly_rate !== null
    ? Number((user_supplied_hours * normalized.project.hourly_rate).toFixed(2))
    : null;
  const preliminary_amount = preliminary_hours !== null && normalized.project.hourly_rate !== null
    ? Number((preliminary_hours * normalized.project.hourly_rate).toFixed(2))
    : null;
  const recommendation = recommendationFor(register);
  const totals = {
    observations: register.length,
    scope_affecting: register.filter((change) => IMPACT_KINDS.has(change.kind)).length,
    clarifications: register.filter((change) => change.kind === "clarification").length,
    ambiguous: register.filter((change) => change.kind === "ambiguous").length,
    estimated_hours,
    user_supplied_hours,
    preliminary_hours,
    estimated_amount,
    estimated_amount_display: money(estimated_amount, normalized.project.currency),
    user_supplied_amount,
    user_supplied_amount_display: money(user_supplied_amount, normalized.project.currency),
    preliminary_amount,
    preliminary_amount_display: money(preliminary_amount, normalized.project.currency),
    estimates_are_preliminary: estimated.some((change) => change.estimate_source === "agent_preliminary"),
  };

  return {
    schema_version: "1.0",
    project: normalized.project.name,
    baseline: {
      source_type: normalized.baseline.source_type,
      source_message_id: normalized.baseline.source_message_id,
      deadline: normalized.baseline.deadline,
      fixed_amount: normalized.baseline.fixed_amount,
      fixed_amount_display: money(normalized.baseline.fixed_amount, normalized.project.currency),
      deliverables: normalized.baseline.deliverables,
      exclusions: normalized.baseline.exclusions,
      acceptance_criteria: normalized.baseline.acceptance_criteria,
    },
    recommendation,
    change_register: register,
    totals,
    draft: buildDraft(normalized, register, totals, recommendation),
    action_boundary: {
      state: recommendation === "NO_CONFIRMED_SCOPE_CHANGE" ? "analysis_only" : "draft_prepared",
      draft_saved: false,
      send_allowed: false,
      external_effect_performed: false,
      requires_human_decision: true,
    },
  };
}

export function renderMarkdown(result) {
  const lines = [
    `# Scope review — ${markdownInline(result.project)}`,
    "",
    `**Recommendation:** ${result.recommendation}`,
    `**Baseline:** ${markdownInline(baselineReference(result.baseline))}`,
    `**Original deadline:** ${markdownInline(result.baseline.deadline ?? "not recorded")}`,
    `**Original fixed amount:** ${markdownInline(result.baseline.fixed_amount_display ?? "not recorded")}`,
    "",
    "## Baseline scope",
    "",
    ...result.baseline.deliverables.map((item) => `- **${markdownInline(item.id)}** — ${markdownInline(item.text)}`),
    "",
    "### Exclusions",
    "",
    ...(result.baseline.exclusions.length > 0 ? result.baseline.exclusions.map((item) => `- ${markdownInline(item)}`) : ["- None recorded"]),
    "",
    "### Acceptance criteria",
    "",
    ...(result.baseline.acceptance_criteria.length > 0 ? result.baseline.acceptance_criteria.map((item) => `- ${markdownInline(item)}`) : ["- None recorded"]),
    "",
    "## Change register",
    "",
  ];
  if (result.change_register.length === 0) {
    lines.push("No grounded changes were found in the selected messages.");
  } else {
    for (const change of result.change_register) {
      const hours = change.estimated_hours === null ? "not estimated" : `${change.estimated_hours} h (${change.estimate_source})`;
      lines.push(`- **${change.kind}** — ${markdownInline(change.evidence_quote)}`);
      lines.push(`  - Evidence: ${markdownInline(change.message_id)}: “${markdownInline(change.evidence_quote)}”`);
      lines.push(`  - Affected baseline item: ${markdownInline(change.baseline_item_id ?? "not linked")}`);
      lines.push(`  - Impact: ${markdownInline(hours)}; severity ${markdownInline(change.severity)}; confidence ${markdownInline(change.confidence)}`);
    }
  }
  lines.push("", "## Totals", "");
  lines.push(`- Scope-affecting observations: ${result.totals.scope_affecting}`);
  lines.push(`- User-supplied hours: ${result.totals.user_supplied_hours ?? "none"}`);
  lines.push(`- Preliminary agent-estimated hours: ${result.totals.preliminary_hours ?? "none"}`);
  lines.push(`- User-supplied amount at supplied rate: ${result.totals.user_supplied_amount_display ?? "none"}`);
  lines.push(`- Preliminary amount at supplied rate: ${result.totals.preliminary_amount_display ?? "none"}`);
  lines.push("", "## Action boundary", "");
  lines.push("Analysis only. No email was sent, scheduled, replied to, forwarded, or paid.");
  if (result.draft) {
    lines.push("", "## Unsent draft", "", `**To:** ${markdownInline(result.draft.to ?? "not set — user must confirm")}`);
    lines.push(`**Subject:** ${markdownInline(result.draft.subject)}`, "");
    lines.push(...result.draft.body_text.split(/\r?\n/).map((line) => `> ${markdownInline(line)}`));
  }
  return `${lines.join("\n")}\n`;
}

async function main(argv) {
  const inputPath = argv[2];
  assert(inputPath, "usage: build-change-order.mjs <input.json> [--format json|markdown]");
  const formatIndex = argv.indexOf("--format");
  const format = formatIndex >= 0 ? argv[formatIndex + 1] : "json";
  assert(format === "json" || format === "markdown", "--format must be json or markdown");
  const input = JSON.parse(await readFile(inputPath, "utf8"));
  const result = analyzeScopeChanges(input);
  process.stdout.write(format === "markdown" ? renderMarkdown(result) : `${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv).catch((error) => {
    process.stderr.write(`Scope guard rejected input: ${error.message}\n`);
    process.exitCode = 1;
  });
}
