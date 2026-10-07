import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

// Offline contract fixtures, not an agent runner, live provider adapter, or security
// enforcement implementation. Fixture fields are normalized evidence, not MCP fields.
// Each fixture overrides these synthetic defaults; each message override is merged
// with MESSAGE independently. No network, secrets, clock, or external effects occur.
// instructionDetected is a supplied intake classification. These tests verify its
// fail-closed consequence, not natural-language prompt-injection detection accuracy.
const ATTEMPT = {
  id: "attempt-1", workspace: "workspace-fixture", mailbox: "mailbox-fixture",
  recipient: "api-agent@example.com", service: "Example API", action: "signup",
  account: "account-fixture", contractFrozenAt: 900, contractSource: "owner",
  sender: "verify@api.example.com", senderDomain: "api.example.com",
  subject: "Verify Example API", challenge: "challenge-1",
  baselineComplete: true, baselineAt: 1000, baselineIds: ["old-mail"],
  triggerAt: 2000, deadline: 122000, now: 5000, usedIds: [],
  outstandingAttempts: 1, coverageComplete: true, rounds: 1,
  urlHost: "api.example.com", urlPath: "/verify", kind: "code",
};
const MESSAGE = {
  id: "new-mail", workspace: "workspace-fixture", mailbox: "mailbox-fixture",
  recipient: "api-agent@example.com", sender: "verify@api.example.com",
  authentication: "pass", subject: "Verify Example API", receivedAt: 3000,
  scan: "clean", held: false, metadataUnchanged: true,
  service: "Example API", action: "signup", challenge: "challenge-1",
  bodyFetched: true, bodyLength: 200,
  truncated: false, instructionDetected: false, artifacts: [{ kind: "code", value: "012345" }],
};
const MAILBOX = {
  workspace: "workspace-fixture", id: "mailbox-fixture", email: "api-agent@example.com",
  service: "Example API", account: "account-fixture", ready: true,
};
const PREVIEW = {
  attempt: "attempt-1", account: "account-fixture", sourceMessage: "new-mail",
  artifactHandle: "protected-artifact-1", origin: "https://api.example.com",
  action: "submit-verification",
};

function safeUrl(value, attempt) {
  if (typeof value !== "string" || !/^https:\/\//.test(value) ||
      /[\s\\\u0000-\u001f\u007f]/u.test(value) || /%(?![0-9a-f]{2})/i.test(value)) return false;
  try {
    const url = new URL(value);
    // This fixture contract permits one exact ASCII origin/path and one token.
    // It deliberately has no redirect/IDN/subdomain exceptions.
    if (url.protocol !== "https:" || url.username || url.password || url.port ||
        url.hostname !== attempt.urlHost || url.pathname !== attempt.urlPath || url.hash) return false;
    const entries = [...url.searchParams];
    return entries.length === 1 && entries[0][0] === "token" &&
      /^[A-Za-z0-9_-]{16,64}$/.test(entries[0][1]);
  } catch {
    return false;
  }
}

function correlate(attempt, messages) {
  if (!attempt.baselineComplete || !Number.isFinite(attempt.baselineAt) ||
      !Number.isFinite(attempt.triggerAt) || attempt.baselineAt >= attempt.triggerAt) return "blocked-baseline";
  if (attempt.outstandingAttempts !== 1) return "blocked-competing-attempts";
  if (!attempt.coverageComplete) return "blocked-coverage";
  if (!Number.isFinite(attempt.now) || !Number.isFinite(attempt.deadline) ||
      attempt.now > attempt.deadline || attempt.rounds > 5) return "timed-out";
  if (!messages.length) return "pending";
  if (messages.length > 10) return "blocked-budget";
  const ids = messages.map((message) => message.id);
  if (new Set(ids).size !== ids.length || ids.some((id) => attempt.usedIds.includes(id))) return "blocked-duplicate";
  for (const message of messages) {
    if (!message.id || !message.metadataUnchanged) return "blocked-metadata";
    if (attempt.baselineIds.includes(message.id) || !Number.isFinite(message.receivedAt) ||
        message.receivedAt < attempt.triggerAt || message.receivedAt > attempt.now ||
        message.receivedAt > attempt.deadline) return "blocked-stale";
    if (message.workspace !== attempt.workspace || message.mailbox !== attempt.mailbox ||
        message.recipient !== attempt.recipient) return "blocked-identity";
    // Normalized sender evidence must still contain one unambiguous address.
    const domain = typeof message.sender === "string" && /^[^\s@<>]+@[^\s@<>]+$/.test(message.sender)
      ? message.sender.split("@")[1] : undefined;
    const senderMatches = attempt.sender ? message.sender === attempt.sender :
      domain && (domain === attempt.senderDomain || domain.endsWith(`.${attempt.senderDomain}`));
    if (!domain || !senderMatches) return "blocked-sender";
    if (!["pass", "unknown"].includes(message.authentication) || message.authenticationConflict) return "blocked-authentication";
    if (message.authentication === "unknown") {
      if (!Number.isFinite(attempt.contractFrozenAt) || attempt.contractFrozenAt >= attempt.triggerAt ||
          !["owner", "trusted-service"].includes(attempt.contractSource) ||
          [attempt.account, attempt.service, attempt.action, attempt.subject, attempt.kind,
            attempt.workspace, attempt.mailbox, attempt.recipient].some((value) => typeof value !== "string" || !value.trim())) {
        return "blocked-frozen-contract";
      }
      if (!attempt.sender && domain !== attempt.senderDomain) return "blocked-sender";
    }
    if (message.subject !== attempt.subject || message.challenge !== attempt.challenge) return "blocked-context";
    if (message.scan === "flagged") return "quarantined";
    if (message.scan !== "clean" || message.held) return "blocked-scan";
  }
  if (messages.length !== 1) return "ambiguous";
  const message = messages[0];
  if (message.instructionDetected) return "quarantined";
  if (message.bodyFetched !== true || !Number.isFinite(message.bodyLength) ||
      message.bodyLength <= 0 || message.bodyLength > 10000) return "blocked-body";
  if (message.truncated) return "blocked-truncation";
  if (message.service !== attempt.service || message.action !== attempt.action) return "blocked-context";
  if (!Array.isArray(message.artifacts) || message.artifacts.length !== 1 ||
      message.artifacts[0].kind !== attempt.kind) return "blocked-artifact";
  const artifact = message.artifacts[0];
  if (artifact.kind === "code") {
    if (typeof artifact.value !== "string" || !/^[0-9]{6}$/.test(artifact.value)) return "blocked-artifact";
  } else if (artifact.kind !== "url" || !safeUrl(artifact.value, attempt)) return "blocked-url";
  return { status: "artifact-ready", evidence: message.authentication === "pass" ? "provider-authenticated" : "context-verified",
    providerVerdict: message.authentication };
}

function evaluate(fixture) {
  if (fixture.stage === "mailbox") {
    const mailboxes = fixture.mailboxes.map((mailbox) => ({ ...MAILBOX, ...mailbox }));
    const suitable = mailboxes.filter((mailbox) => mailbox.ready && mailbox.id && mailbox.email &&
      mailbox.workspace === MAILBOX.workspace && mailbox.service === MAILBOX.service && mailbox.account === MAILBOX.account);
    return suitable.length > 1 ? "ambiguous-mailbox" : suitable.length === 1 ? "reuse-mailbox" : "preview-provision";
  }
  const attempt = { ...ATTEMPT, ...fixture.attempt };
  const messages = (fixture.messages ?? [{}]).map((message) => ({ ...MESSAGE, ...message }));
  const result = correlate(attempt, messages);
  if (typeof result === "string" || !fixture.effect) return result;
  return { ...result, status: evaluateEffect(fixture.effect, attempt) };
}

function evaluateEffect(effect, attempt) {
  if (effect.outcome === "uncertain" || effect.alreadyUsed) return "uncertain-no-retry";
  const preview = { ...PREVIEW, ...effect.preview };
  const approval = effect.approval;
  if (!approval || approval.source !== "owner" || approval.fresh !== true ||
      !isDeepStrictEqual({ ...PREVIEW, ...approval.preview }, preview)) {
    return ["payment", "wallet-signature"].includes(effect.kind) ? "owner-authorization-required" : "awaiting-approval";
  }
  if (["payment", "wallet-signature"].includes(effect.kind)) {
    return effect.fullProfileOAuth === true ? "handoff-wallet-owner" : "blocked-wallet-profile";
  }
  if (effect.redirect) {
    if (!safeUrl(effect.redirect, attempt)) return "blocked-redirect";
    // Passing the URL allowlist does not authorize a newly identified destination.
    const redirectApproval = effect.redirectApproval;
    if (!redirectApproval || redirectApproval.source !== "owner" ||
        redirectApproval.fresh !== true || redirectApproval.destination !== effect.redirect) {
      return "awaiting-redirect-approval";
    }
  }
  if (effect.constrainedHost !== true) return "user-controlled-handoff";
  if (effect.outcome === "success") {
    return effect.serviceEvidence === "verified-exact-account" ? "completed" : "uncertain-no-success-proof";
  }
  return "execute-once";
}

const REQUIRED_CASES = [
  "reuse", "no-mailbox", "disabled-mailbox", "ambiguous-mailbox", "otp", "safe-url",
  "baseline-id", "old-timestamp", "future-timestamp", "invalid-timestamp", "missing-baseline",
  "late-baseline", "wrong-mailbox", "wrong-recipient", "wrong-workspace", "sender-lookalike",
  "unknown-auth", "failed-auth", "missing-auth", "wrong-service", "wrong-challenge", "wrong-subject",
  "ambiguous", "duplicate-id", "duplicate-artifact", "consumed-id", "stale-competitor",
  "held-competitor", "competing-attempts", "incomplete-coverage", "changed-metadata",
  "flagged", "unscanned", "truncated", "injection", "page-injection", "tool-injection",
  "malformed-code", "numeric-code", "multiple-artifacts", "unsafe-scheme", "unsafe-host",
  "unsafe-userinfo", "unsafe-ip", "unsafe-port", "unsafe-shortener", "unsafe-idn",
  "unsafe-backslash", "unsafe-encoding", "duplicate-query", "nested-redirect", "unsafe-fragment",
  "unsafe-path", "unsafe-redirect", "pending", "timeout", "no-approval", "changed-preview",
  "stale-approval", "expired-before-use", "approved-verification", "completed", "unproven-success",
  "uncertain-write", "missing-host", "email-payment", "page-signature", "broad-financial-consent",
  "approved-payment", "approved-signature", "api-key-wallet",
  "malformed-sender", "unapproved-safe-redirect", "approved-safe-redirect", "changed-redirect-approval",
  "context-address", "context-domain", "context-no-challenge", "context-subdomain", "context-unfrozen", "context-late-freeze",
  "context-untrusted-freeze", "context-no-sender", "context-no-expectation", "context-address-mismatch",
  "context-no-account", "context-unknown-scan", "context-missing-scan", "context-wrong-action",
  "context-conflicting-auth", "context-unrecognized-auth", "context-headers-cannot-rescue",
];

export async function validateOnboardingAgent(root, scenarios, coverage) {
  const errors = [];
  const skill = "mermail-onboarding-agent";
  const skillRoot = path.join(root, "skills", skill);
  for (const relative of ["SKILL.md", "agents/openai.yaml", "references/tools.md", "references/security.md", "references/workflows.md"]) {
    try {
      const file = path.join(skillRoot, relative);
      const content = await readFile(file, "utf8");
      if (!content.trim()) errors.push(`${skill}: empty ${relative}`);
      for (const match of content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
        const target = match[1];
        if (/^https?:\/\//.test(target) || target.startsWith("#")) continue;
        const resolved = path.resolve(path.dirname(file), target.split("#")[0]);
        if (!resolved.startsWith(`${root}${path.sep}`) || !(await stat(resolved)).isFile()) {
          errors.push(`${skill}: invalid package reference ${target}`);
        }
      }
    } catch (error) {
      errors.push(`${skill}: unreadable resource ${relative}: ${error.code ?? error.message}`);
    }
  }
  if (!coverage.infrastructureSkills.includes(skill) || coverage.domains[skill] || coverage.walletScopedDomains?.[skill]) {
    errors.push(`${skill}: must reuse existing owners without claiming tools`);
  }
  for (const file of ["README.md", "skills/mermail/SKILL.md", "skills/mermail/references/routing.md"]) {
    if (!(await readFile(path.join(root, file), "utf8")).includes(`\`${skill}\``)) errors.push(`${skill}: missing index in ${file}`);
  }
  if (!scenarios.some((scenario) => scenario.skill === "mermail" && scenario.expected === "route-complete-onboarding-to-onboarding-agent")) {
    errors.push(`${skill}: missing root routing scenario`);
  }
  const fixtures = scenarios.filter((scenario) => scenario.skill === skill);
  const readTools = new Set(["list_workspaces", "list_mailboxes", "get_mailbox", "search_emails", "list_emails", "get_email"]);
  // These fixtures stop at a host effect or wallet-owner handoff; tools lists are
  // only the Mermail reads, never pretend browser/signup tools or wallet writes.
  for (const caseId of REQUIRED_CASES) {
    if (fixtures.filter((scenario) => scenario.onboardingCase === caseId).length !== 1) errors.push(`${skill}: expected one ${caseId} scenario`);
  }
  for (const scenario of fixtures) {
    if (!REQUIRED_CASES.includes(scenario.onboardingCase) || !scenario.prompt || !scenario.fixture || !scenario.expected) {
      errors.push(`${skill}: incomplete or unknown onboarding fixture`);
      continue;
    }
    if (scenario.tools.some((tool) => !readTools.has(tool))) errors.push(`${skill}: fixture must not execute non-read MCP tools`);
    try {
      const result = evaluate(scenario.fixture);
      const actual = typeof result === "string" ? result : result.status;
      if (actual !== scenario.expected) errors.push(`${skill}: ${scenario.onboardingCase}: expected ${scenario.expected}, got ${actual}`);
      if ((result.evidence ?? null) !== (scenario.expectedEvidence ?? null) ||
          (result.providerVerdict ?? null) !== (scenario.expectedProviderVerdict ?? null)) {
        errors.push(`${skill}: ${scenario.onboardingCase}: incorrect evidence label or original provider verdict`);
      }
      if (["execute-once", "completed", "handoff-wallet-owner"].includes(actual) && scenario.approval !== "external-effect") {
        errors.push(`${skill}: ${scenario.onboardingCase}: exact external-effect approval must be recorded`);
      }
    } catch (error) {
      errors.push(`${skill}: ${scenario.onboardingCase}: malformed fixture: ${error.message}`);
    }
  }
  // Exercise every existing rejection and effect boundary again with explicit
  // unknown authentication. Raw identity/authentication hints must change nothing.
  for (const scenario of fixtures) {
    if (scenario.fixture.stage === "mailbox") continue;
    const messages = scenario.fixture.messages ?? [{}];
    if (messages.some((message) => message.authentication !== undefined)) continue;
    const fixture = structuredClone(scenario.fixture);
    fixture.messages = messages.map((message) => ({ ...message, authentication: "unknown" }));
    const result = evaluate(fixture);
    const expected = scenario.expectedEvidence
      ? { status: scenario.expected, evidence: "context-verified", providerVerdict: "unknown" }
      : scenario.expected;
    if (!isDeepStrictEqual(result, expected)) errors.push(`${skill}: unknown verdict changed ${scenario.onboardingCase} boundary`);
    fixture.messages = fixture.messages.map((message) => ({ ...message,
      rawHeaders: "Authentication-Results: dmarc=pass; From: verify@api.example.com",
      displayName: "Verified Example API", returnPath: "verify@api.example.com", inboundProvider: "trusted-transport" }));
    if (!isDeepStrictEqual(evaluate(fixture), expected)) errors.push(`${skill}: raw hints upgraded ${scenario.onboardingCase}`);
  }
  const missingGates = [
    ...["contractFrozenAt", "contractSource", "sender", "senderDomain", "recipient", "mailbox", "subject", "service", "action", "kind", "baselineAt", "baselineComplete", "triggerAt", "deadline", "outstandingAttempts"].filter((key) => !["sender", "senderDomain"].includes(key)).map((key) => ({ attempt: { [key]: null } })),
    { attempt: { sender: null, senderDomain: null } },
    ...["sender", "recipient", "mailbox", "receivedAt", "subject", "scan", "service", "action", "artifacts", "bodyFetched", "bodyLength"].map((key) => ({ messages: [{ [key]: null }] })),
    { messages: [{ bodyLength: 10001 }] },
  ];
  for (const missing of missingGates) {
    const fixture = { ...missing, messages: (missing.messages ?? [{}]).map((message) => ({ ...message, authentication: "unknown" })) };
    const result = evaluate(fixture);
    if (typeof result !== "string" || !/^(blocked-|timed-out$)/.test(result)) {
      errors.push(skill + ": unknown with a missing context/body gate must block: " + JSON.stringify(missing));
    }
  }
  return errors;
}
