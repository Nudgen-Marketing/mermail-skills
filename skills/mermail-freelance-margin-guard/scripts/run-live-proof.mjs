#!/usr/bin/env node

import process from "node:process";
import { pathToFileURL } from "node:url";

import {
  buildMarginPacket,
  verifyMarginPacket,
} from "./build-margin-packet.mjs";

const MCP_ENDPOINT = "https://console.mermail.app/mcp";
const BASELINE_DEADLINE = "2026-10-20";
const REQUESTED_DEADLINE = "2026-10-15";
const WAIT_ATTEMPTS = 12;
const WAIT_MS = 2500;

export const LIVE_BASELINE_BODY =
  "Accepted scope: one responsive landing page and two revision rounds. " +
  "Excluded: authenticated application and login, admin dashboard, and payment processing. " +
  "Acceptance: responsive at agreed desktop, tablet, and mobile breakpoints. " +
  `Deadline: ${BASELINE_DEADLINE}.`;

export const LIVE_REQUEST_BODY =
  "Change request: add an admin dashboard, Stripe payment processing, user login, " +
  `two more revision rounds, and deliver five calendar days earlier (${REQUESTED_DEADLINE}). ` +
  "Staging credentials were supplied two days after the agreed access date.";

class SafeError extends Error {
  constructor(stage) {
    super(`live proof stopped at ${stage}`);
    this.name = "SafeError";
  }
}

function invariant(condition, stage) {
  if (!condition) throw new SafeError(stage);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalize(value) {
  return String(value)
    .replace(/<[^>]*>/gu, " ")
    .replace(/&nbsp;/giu, " ")
    .replace(/&amp;/giu, "&")
    .toLocaleLowerCase("en-US")
    .replace(/\s+/gu, " ")
    .trim();
}

function walkObjects(value, result = [], seen = new Set()) {
  if (value === null || typeof value !== "object" || seen.has(value)) return result;
  seen.add(value);
  if (isObject(value)) result.push(value);
  for (const child of Array.isArray(value) ? value : Object.values(value)) {
    walkObjects(child, result, seen);
  }
  return result;
}

function walkStrings(value, result = [], seen = new Set()) {
  if (typeof value === "string") {
    result.push(value);
    return result;
  }
  if (value === null || typeof value !== "object" || seen.has(value)) return result;
  seen.add(value);
  for (const child of Array.isArray(value) ? value : Object.values(value)) {
    walkStrings(child, result, seen);
  }
  return result;
}

function firstString(object, keys) {
  for (const key of keys) {
    if (typeof object?.[key] === "string" && object[key].trim()) return object[key].trim();
  }
  return null;
}

function responsePayload(rpc, stage) {
  invariant(isObject(rpc?.result), `${stage}:rpc-result`);
  invariant(rpc.result.isError !== true, `${stage}:tool-result`);
  const payloads = [];
  if (rpc.result.structuredContent !== undefined) payloads.push(rpc.result.structuredContent);
  for (const item of Array.isArray(rpc.result.content) ? rpc.result.content : []) {
    if (item?.type !== "text" || typeof item.text !== "string") continue;
    try {
      payloads.push(JSON.parse(item.text));
    } catch {
      payloads.push({ text: item.text });
    }
  }
  invariant(payloads.length > 0, `${stage}:empty-result`);
  return payloads;
}

async function mcpRequest(apiKey, id, method, params, stage) {
  let response;
  try {
    response = await fetch(MCP_ENDPOINT, {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    });
  } catch {
    throw new SafeError(`${stage}:network`);
  }
  invariant(response.ok, `${stage}:http-${response.status}`);
  let rpc;
  try {
    rpc = await response.json();
  } catch {
    throw new SafeError(`${stage}:response-format`);
  }
  invariant(!rpc?.error, `${stage}:rpc-error`);
  return rpc;
}

async function callTool(apiKey, counter, name, args, stage) {
  const rpc = await mcpRequest(
    apiKey,
    counter.next(),
    "tools/call",
    { name, arguments: args },
    stage,
  );
  return responsePayload(rpc, stage);
}

async function callMutationOnce(apiKey, counter, name, args, stage) {
  const rpc = await mcpRequest(
    apiKey,
    counter.next(),
    "tools/call",
    { name, arguments: args },
    stage,
  );
  invariant(isObject(rpc?.result), `${stage}:rpc-result`);
  invariant(rpc.result.isError !== true, `${stage}:tool-result`);
}

function createCounter() {
  let id = 0;
  return { next: () => ++id };
}

function resolveMailbox(payloads, selectedId) {
  const candidates = [];
  for (const object of walkObjects(payloads)) {
    const id = firstString(object, ["public_id", "publicId", "mailbox_id", "mailboxId", "id"]);
    const email = firstString(object, ["email", "email_address", "emailAddress", "address"]);
    if (!id || !email || !email.includes("@")) continue;
    if (object.disabled_at || object.disabledAt) continue;
    const status = firstString(object, ["status", "state"]);
    if (status && ["disabled", "deleted", "failed", "pending"].includes(status.toLowerCase())) continue;
    candidates.push({ id, email });
  }
  const unique = [...new Map(candidates.map((candidate) => [candidate.id, candidate])).values()];
  if (selectedId) {
    const selected = unique.find((candidate) => candidate.id === selectedId);
    invariant(selected, "mailbox-selection");
    return selected;
  }
  invariant(unique.length === 1, "mailbox-selection");
  return unique[0];
}

function resolveEmailMetadata(payloads, subject) {
  const expected = normalize(subject);
  const candidates = [];
  for (const object of walkObjects(payloads)) {
    const actualSubject = firstString(object, ["subject", "email_subject", "emailSubject"]);
    if (!actualSubject || normalize(actualSubject) !== expected) continue;
    const id = firstString(object, ["email_id", "emailId", "message_id", "messageId", "public_id", "publicId", "id"]);
    if (!id) continue;
    const rawDate = firstString(object, [
      "date",
      "received_at",
      "receivedAt",
      "sent_at",
      "sentAt",
      "created_at",
      "createdAt",
      "timestamp",
    ]);
    candidates.push({ id, rawDate });
  }
  const unique = [...new Map(candidates.map((candidate) => [candidate.id, candidate])).values()];
  invariant(unique.length === 1, "message-selection");
  return unique[0];
}

function resolveMessageDate(payloads, metadataDate) {
  const candidates = [metadataDate];
  for (const object of walkObjects(payloads)) {
    candidates.push(firstString(object, [
      "date",
      "received_at",
      "receivedAt",
      "sent_at",
      "sentAt",
      "created_at",
      "createdAt",
      "timestamp",
    ]));
  }
  for (const candidate of candidates) {
    if (!candidate) continue;
    const parsed = new Date(candidate);
    if (!Number.isNaN(parsed.valueOf())) return parsed.toISOString().slice(0, 10);
  }
  throw new SafeError("message-date");
}

function assertMessageEvidence(payloads, requiredPhrases) {
  const corpus = normalize(walkStrings(payloads).join(" "));
  for (const phrase of requiredPhrases) {
    invariant(corpus.includes(normalize(phrase)), "message-evidence");
  }
}

async function findMessage(apiKey, counter, mailboxId, subject, window) {
  let lastPayloads = null;
  for (let attempt = 0; attempt < WAIT_ATTEMPTS; attempt += 1) {
    lastPayloads = await callTool(
      apiKey,
      counter,
      "search_emails",
      {
        mailboxId,
        query: {
          text: subject,
          date_start: window.start,
          date_end: window.end,
          page: 1,
          limit: 10,
          metadata_only: true,
          agent_safe_content: true,
        },
      },
      "bounded-search",
    );
    try {
      return resolveEmailMetadata(lastPayloads, subject);
    } catch (error) {
      if (!(error instanceof SafeError) || attempt === WAIT_ATTEMPTS - 1) throw error;
      await sleep(WAIT_MS);
    }
  }
  throw new SafeError("message-selection");
}

async function readCleanMessage(apiKey, counter, mailboxId, emailId, phrases) {
  for (let attempt = 0; attempt < WAIT_ATTEMPTS; attempt += 1) {
    try {
      const payloads = await callTool(
        apiKey,
        counter,
        "get_email",
        {
          mailboxId,
          emailId,
          query: {
            require_scan_status: "clean",
            agent_safe_content: true,
            max_body_chars: 10000,
          },
        },
        "selected-message-read",
      );
      assertMessageEvidence(payloads, phrases);
      return payloads;
    } catch (error) {
      if (!(error instanceof SafeError) || attempt === WAIT_ATTEMPTS - 1) throw error;
      await sleep(WAIT_MS);
    }
  }
  throw new SafeError("selected-message-read");
}

export function buildLiveMarginInput({ baselineMessageId, requestMessageId, baselineDate, requestDate }) {
  return {
    version: 1,
    project: { name: "Northstar Landing Page — live synthetic proof" },
    sources: [
      {
        id: "accepted-proposal",
        type: "email",
        messageId: baselineMessageId,
        date: baselineDate,
        quote: LIVE_BASELINE_BODY,
      },
      {
        id: "approved-rate",
        type: "user",
        label: "Owner-approved hourly rate",
        quote: "15 USD per hour",
      },
      {
        id: "approved-estimate",
        type: "user",
        label: "Owner-approved implementation estimate",
      },
      {
        id: "approved-rush-rule",
        type: "user",
        label: "Owner-approved rush rule",
        quote: "25 percent of added labor fee",
      },
      {
        id: "later-request",
        type: "email",
        messageId: requestMessageId,
        date: requestDate,
        quote: LIVE_REQUEST_BODY,
      },
    ],
    baseline: {
      authoritySourceRefs: ["accepted-proposal"],
      deliverables: [
        {
          id: "landing-page",
          label: "Responsive marketing landing page",
          sourceRef: "accepted-proposal",
        },
      ],
      exclusions: [
        { text: "No authenticated application or login", sourceRef: "accepted-proposal" },
        { text: "No admin dashboard", sourceRef: "accepted-proposal" },
        { text: "No payment processing integration", sourceRef: "accepted-proposal" },
      ],
      acceptanceCriteria: [
        {
          text: "Responsive at agreed desktop, tablet, and mobile breakpoints",
          sourceRef: "accepted-proposal",
        },
      ],
      revisionBudget: { included: 2, used: 1, sourceRef: "accepted-proposal" },
      deadline: { date: BASELINE_DEADLINE, sourceRef: "accepted-proposal" },
      pricing: {
        currency: "USD",
        rate: { amount: 15, unit: "hour", sourceRef: "approved-rate" },
        hoursPerWorkday: 8,
        rushPremium: {
          percent: 25,
          basis: "added_labor_fee",
          sourceRef: "approved-rush-rule",
        },
      },
    },
    request: {
      sourceRef: "later-request",
      requestedDeadline: REQUESTED_DEADLINE,
      items: [
        {
          id: "admin-dashboard",
          label: "Add an admin dashboard",
          kind: "deliverable",
          relation: "excluded",
          materiality: "material",
          implementationDelta: true,
          sourceRef: "later-request",
          evidenceQuote: "add an admin dashboard",
          baselineSourceRefs: ["accepted-proposal"],
          effortHours: { min: 10, max: 12, sourceRef: "approved-estimate" },
        },
        {
          id: "payment-integration",
          label: "Add Stripe payment processing",
          kind: "deliverable",
          relation: "excluded",
          materiality: "material",
          implementationDelta: true,
          sourceRef: "later-request",
          evidenceQuote: "Stripe payment processing",
          baselineSourceRefs: ["accepted-proposal"],
          effortHours: { min: 8, max: 10, sourceRef: "approved-estimate" },
        },
        {
          id: "authentication",
          label: "Add user login and authentication",
          kind: "deliverable",
          relation: "excluded",
          materiality: "material",
          implementationDelta: true,
          sourceRef: "later-request",
          evidenceQuote: "user login",
          baselineSourceRefs: ["accepted-proposal"],
          effortHours: { min: 6, max: 8, sourceRef: "approved-estimate" },
        },
        {
          id: "two-revisions",
          label: "Provide two additional revision rounds",
          kind: "revision",
          relation: "exceeds_limit",
          materiality: "material",
          implementationDelta: true,
          units: 2,
          sourceRef: "later-request",
          evidenceQuote: "two more revision rounds",
          baselineSourceRefs: ["accepted-proposal"],
          effortHours: { min: 4, max: 6, sourceRef: "approved-estimate" },
        },
        {
          id: "accelerated-deadline",
          label: "Deliver five calendar days earlier",
          kind: "deadline",
          relation: "exceeds_limit",
          materiality: "material",
          implementationDelta: true,
          sourceRef: "later-request",
          evidenceQuote: "deliver five calendar days earlier",
          baselineSourceRefs: ["accepted-proposal"],
          effortHours: { min: 0, max: 0, sourceRef: "approved-estimate" },
        },
      ],
    },
    dependencies: [
      {
        id: "staging-access",
        label: "Staging credentials arrived after the agreed access date",
        owner: "client",
        delayDays: 2,
        sourceRef: "later-request",
        evidenceQuote: "supplied two days after",
      },
    ],
  };
}

function outputProof(packet, dates) {
  const verification = verifyMarginPacket(packet);
  invariant(verification.valid, "packet-integrity");
  invariant(packet.state === "scope_change_detected", "packet-state");
  invariant(packet.clientOptions.length === 3, "packet-options");
  invariant(packet.marginSnapshot.unpricedItemIds.length === 0, "packet-pricing");

  process.stdout.write("Live Mermail Margin Guard proof passed.\n");
  process.stdout.write("Privacy: API key, mailbox address, mailbox id, message ids, and message bodies are redacted.\n");
  process.stdout.write("Evidence path: 1 ready mailbox; 2 synthetic self-addressed messages; 2 bounded metadata searches; 2 clean selected-message reads.\n");
  process.stdout.write(`Evidence dates: baseline ${dates.baseline}; request ${dates.request}.\n`);
  process.stdout.write(`Decision: ${packet.state}; revision budget 2 included / 1 previously used / 1 newly covered / 1 overflow / 0 remaining.\n`);
  process.stdout.write(`Margin: ${packet.marginSnapshot.knownAddedHours.min}-${packet.marginSnapshot.knownAddedHours.max} hours; ${packet.marginSnapshot.completeBaseFeeRange.min}-${packet.marginSnapshot.completeBaseFeeRange.max} USD base.\n`);
  process.stdout.write(`Rush: ${packet.marginSnapshot.rushPremiumAmountRange.min}-${packet.marginSnapshot.rushPremiumAmountRange.max} USD; requested-deadline total ${packet.marginSnapshot.completeTotalFeeRange.min}-${packet.marginSnapshot.completeTotalFeeRange.max} USD.\n`);
  process.stdout.write(`Options: ${packet.clientOptions.map((option) => option.id).join(", ")} (exactly 3).\n`);
  process.stdout.write(`Evidence digest: ${packet.integrity.evidenceDigest}\n`);
  process.stdout.write(`Packet digest: ${packet.integrity.packetDigest}\n`);
  process.stdout.write("Delivery: no client email, reply, draft, wallet action, or financial action was performed.\n");
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    process.stdout.write("Usage: run-live-proof.mjs --seed-and-prove\n");
    return;
  }
  invariant(process.argv.includes("--seed-and-prove"), "mode");
  const apiKey = process.env.MERMAIL_API_KEY;
  const runTag = process.env.MERMAIL_LIVE_RUN_TAG;
  invariant(apiKey, "configuration");
  invariant(process.env.MERMAIL_LIVE_SEND_APPROVED === "1", "send-approval");
  invariant(typeof runTag === "string" && /^[A-Za-z0-9-]{1,48}$/.test(runTag), "run-tag");

  const counter = createCounter();
  const initialized = await mcpRequest(
    apiKey,
    counter.next(),
    "initialize",
    {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "mermail-margin-guard-proof", version: "1.0.0" },
    },
    "initialize",
  );
  invariant(initialized?.result?.serverInfo, "initialize:server-info");

  const listed = await mcpRequest(apiKey, counter.next(), "tools/list", {}, "tool-list");
  const names = new Set((listed?.result?.tools ?? []).map((tool) => tool?.name));
  for (const required of ["list_mailboxes", "send_email", "search_emails", "get_email"]) {
    invariant(names.has(required), "tool-contract");
  }

  const mailboxPayloads = await callTool(apiKey, counter, "list_mailboxes", {}, "mailbox-list");
  const mailbox = resolveMailbox(mailboxPayloads, process.env.MERMAIL_LIVE_MAILBOX_ID);
  const baselineSubject = `[FMG-LIVE-${runTag}] Accepted scope`;
  const requestSubject = `[FMG-LIVE-${runTag}] Change request`;

  const sends = [
    { subject: baselineSubject, body: LIVE_BASELINE_BODY, suffix: "baseline" },
    { subject: requestSubject, body: LIVE_REQUEST_BODY, suffix: "request" },
  ];
  for (const message of sends) {
    await callMutationOnce(
      apiKey,
      counter,
      "send_email",
      {
        mailboxId: mailbox.id,
        idempotencyKey: `fmg-live-${runTag}-${message.suffix}`,
        body: {
          to: mailbox.email,
          from: mailbox.email,
          subject: message.subject,
          text: message.body,
        },
      },
      `self-send-${message.suffix}`,
    );
  }

  const now = new Date();
  const start = new Date(now.valueOf() - 24 * 60 * 60 * 1000).toISOString();
  const end = new Date(now.valueOf() + 24 * 60 * 60 * 1000).toISOString();
  const window = { start, end };
  const baselineMetadata = await findMessage(apiKey, counter, mailbox.id, baselineSubject, window);
  const requestMetadata = await findMessage(apiKey, counter, mailbox.id, requestSubject, window);

  const baselinePayloads = await readCleanMessage(apiKey, counter, mailbox.id, baselineMetadata.id, [
    "one responsive landing page",
    "two revision rounds",
    "admin dashboard",
    BASELINE_DEADLINE,
  ]);
  const requestPayloads = await readCleanMessage(apiKey, counter, mailbox.id, requestMetadata.id, [
    "Stripe payment processing",
    "two more revision rounds",
    "five calendar days earlier",
    "supplied two days after",
  ]);

  const dates = {
    baseline: resolveMessageDate(baselinePayloads, baselineMetadata.rawDate),
    request: resolveMessageDate(requestPayloads, requestMetadata.rawDate),
  };
  const packet = buildMarginPacket(buildLiveMarginInput({
    baselineMessageId: baselineMetadata.id,
    requestMessageId: requestMetadata.id,
    baselineDate: dates.baseline,
    requestDate: dates.request,
  }));
  outputProof(packet, dates);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    const safeMessage = error instanceof SafeError ? error.message : "live proof stopped unexpectedly";
    process.stderr.write(`Freelance Margin Guard: ${safeMessage}. Sensitive details were not printed.\n`);
    process.exitCode = 1;
  });
}
