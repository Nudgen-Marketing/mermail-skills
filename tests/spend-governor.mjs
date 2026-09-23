// Reference-set validation for `mermail-spend-governor`.
//
// Unlike the packaging checks elsewhere in this repo, this file exercises the *decision ladder* from
// `skills/mermail-spend-governor/references/workflows.md` as executable logic: a policy, a ledger
// state, and one payment request go in; the exact decision word comes out and is compared against a
// golden expectation. It is a policy-evaluator reference set, not an agent execution or a payment
// simulator — nothing here signs, pays, or touches a wallet.
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { GOLDEN_CASES } from "./fixtures/spend-governor/cases.mjs";

const SKILL = "mermail-spend-governor";
const REQUIRED_FILES = [
  "SKILL.md",
  "agents/openai.yaml",
  "references/tools.md",
  "references/security.md",
  "references/workflows.md",
  "references/policy.md",
];

// Fields the policy contract marks required; a missing one is `policy_absent`, never a guess.
const REQUIRED_POLICY_FIELDS = [
  "policyId",
  "period",
  "periodCapUsd",
  "perRequestCapUsd",
  "originAllowlist",
  "assetAllowlist",
  "escalationEmail",
  "ledgerPath",
  "timezone",
];

// Everything a case does not override. Cases stay readable and still start from a complete policy.
const BASE_POLICY = {
  policyId: "100pro-agent-spend-v1",
  period: "day",
  periodCapUsd: 5,
  perRequestCapUsd: 0.25,
  originAllowlist: ["x402.rendraputra.dev"],
  assetAllowlist: ["USDC@base"],
  escalationEmail: "owner@example.com",
  ledgerPath: "./agent-spend-ledger.jsonl",
  timezone: "UTC",
};

const QUALIFYING_STATUSES = new Set(["proof_ready", "settled", "unverified"]);
const UNRESOLVED_STATUSES = new Set(["proof_ready", "unverified"]);
const DECISION_WORDS = [
  "policy_ok",
  "needs_owner_approval",
  "policy_blocked_over_cap",
  "policy_blocked_origin",
  "policy_blocked_asset",
  "duplicate_suspected",
  "policy_absent",
  "ledger_unavailable",
];

// Money comparisons must never round in the payer's favour, so amounts are compared as integer
// nano-units instead of floats (0.25 + 0.05 !== 0.3 in binary floating point).
function toNano(value) {
  if (typeof value === "number") value = String(value);
  if (typeof value !== "string" || !/^-?\d+(\.\d+)?$/.test(value.trim())) return null;
  const negative = value.trim().startsWith("-");
  const [whole, fraction = ""] = value.trim().replace("-", "").split(".");
  const nano = BigInt(whole) * 1000000000n + BigInt((fraction + "000000000").slice(0, 9));
  return negative ? -nano : nano;
}

function fromNano(nano) {
  const negative = nano < 0n;
  const abs = negative ? -nano : nano;
  const whole = abs / 1000000000n;
  const fraction = (abs % 1000000000n).toString().padStart(9, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

// Period window in the policy timezone, using wall-clock boundaries as workflows.md requires.
function periodWindow(nowIso, period, timezone) {
  const now = new Date(nowIso);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    }).formatToParts(now).filter((p) => p.type !== "literal").map((p) => [p.type, p.value]),
  );
  const localAsUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour) % 24, Number(parts.minute), Number(parts.second),
  );
  const offsetMs = localAsUtc - now.getTime();
  let start = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
  if (period === "week") {
    const weekday = new Date(start).getUTCDay(); // 0 = Sunday
    start -= ((weekday + 6) % 7) * 86400000;    // roll back to Monday
  } else if (period === "month") {
    start = Date.UTC(Number(parts.year), Number(parts.month) - 1, 1);
  }
  return { start: new Date(start - offsetMs), end: now };
}

export function evaluateSpend({ policy, ledger = [], request, now }) {
  const asOf = now ?? new Date().toISOString();
  if (!policy) return { decision: "policy_absent", reason: "no owner-authenticated policy" };

  const unknownFields = Object.keys(policy).filter(
    (key) => ![...REQUIRED_POLICY_FIELDS, "autoApproveCeilingUsd", "requireOwnerApprovalAboveUsd"].includes(key),
  );
  for (const field of REQUIRED_POLICY_FIELDS) {
    const value = policy[field];
    if (value === undefined || value === null || value === "") {
      return { decision: "policy_absent", reason: `missing required field ${field}`, unknownFields };
    }
  }

  const charge = toNano(request.requiredCharge);
  if (charge === null) return { decision: "ledger_unavailable", reason: "unparseable required_charge" };

  // 3. origin allowlist — an empty list permits nothing.
  if (!policy.originAllowlist.includes(request.origin)) {
    return { decision: "policy_blocked_origin", reason: `${request.origin} not in originAllowlist`, unknownFields };
  }

  // 4. asset allowlist, as an asset@chain pair.
  const pair = `${request.asset}@${request.chain}`;
  if (!policy.assetAllowlist.includes(pair)) {
    return { decision: "policy_blocked_asset", reason: `${pair} not in assetAllowlist`, unknownFields };
  }

  // 5. per-request cap on the owning skill's required_charge.
  if (charge > toNano(String(policy.perRequestCapUsd))) {
    return { decision: "policy_blocked_over_cap", reason: "required_charge exceeds perRequestCapUsd", unknownFields };
  }

  // 6. rolling period cap over qualifying entries inside the window.
  const window = periodWindow(asOf, policy.period, policy.timezone);
  const qualifying = ledger.filter(
    (entry) =>
      QUALIFYING_STATUSES.has(entry.status) &&
      Date.parse(entry.ts) >= window.start.getTime() &&
      Date.parse(entry.ts) <= window.end.getTime(),
  );
  const periodSpend = qualifying.reduce((sum, entry) => sum + (toNano(entry.required_charge) ?? 0n), 0n);
  const periodCap = toNano(String(policy.periodCapUsd));
  const remainingHeadroom = periodCap - periodSpend;
  if (periodSpend + charge > periodCap) {
    return {
      decision: "policy_blocked_over_cap",
      reason: "period_spend + required_charge exceeds periodCapUsd",
      periodSpend: fromNano(periodSpend),
      remainingHeadroom: fromNano(remainingHeadroom),
      unknownFields,
    };
  }

  // 7. duplicate guard: unresolved entry with the same origin + resource + asset + amount.
  const duplicate = ledger.find(
    (entry) =>
      UNRESOLVED_STATUSES.has(entry.status) &&
      entry.origin === request.origin &&
      entry.resource === request.resource &&
      entry.asset === request.asset &&
      toNano(entry.required_charge) === charge,
  );
  if (duplicate) {
    return { decision: "duplicate_suspected", reason: "unresolved entry with the same origin/resource/amount", unknownFields };
  }

  // 8. approval threshold: the lower of the two declared thresholds gates, defaulting to the
  // per-request cap so an absent ceiling can never widen the policy.
  const ceilingCandidates = [policy.autoApproveCeilingUsd, policy.requireOwnerApprovalAboveUsd]
    .filter((value) => value !== undefined && value !== null)
    .map((value) => toNano(String(value)));
  const ceiling = ceilingCandidates.length
    ? ceilingCandidates.reduce((lowest, value) => (value < lowest ? value : lowest))
    : toNano(String(policy.perRequestCapUsd));

  const decision = charge <= ceiling ? "policy_ok" : "needs_owner_approval";
  return {
    decision,
    reason: decision === "policy_ok" ? "inside every gate" : "above the auto-approve ceiling",
    remainingHeadroom: fromNano(remainingHeadroom),
    window: { start: window.start.toISOString(), end: window.end.toISOString() },
    unknownFields,
  };
}

export async function validateSpendGovernor(root, scenarios, coverage) {
  const errors = [];
  const skillRoot = path.join(root, "skills", SKILL);

  // 1. files, references, and the decision vocabulary the skill commits to.
  for (const file of REQUIRED_FILES) {
    const fullPath = path.join(skillRoot, file);
    try {
      const content = await readFile(fullPath, "utf8");
      for (const match of content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
        const target = match[1];
        if (/^https?:\/\//.test(target) || target.startsWith("#")) continue;
        const resolved = path.resolve(path.dirname(fullPath), target.split("#")[0]);
        if (!resolved.startsWith(`${root}${path.sep}`)) {
          errors.push(`${SKILL}: reference leaves the package: ${target}`);
          continue;
        }
        if (!(await stat(resolved)).isFile()) errors.push(`${SKILL}: invalid reference ${target}`);
      }
    } catch (error) {
      errors.push(`${SKILL}: missing or unreadable resource in ${file}: ${error.code ?? error.message}`);
    }
  }

  const skill = await readFile(path.join(skillRoot, "SKILL.md"), "utf8");
  for (const word of DECISION_WORDS) {
    if (!skill.includes(word)) errors.push(`${SKILL}: SKILL.md does not document decision ${word}`);
  }
  for (const word of ["allow, require approval, or block", "append-only", "provenance"]) {
    if (!skill.includes(word)) errors.push(`${SKILL}: SKILL.md must state ${word}`);
  }

  // 2. the scenario file must carry the spend-governor cases, including the email-authority trap.
  const fixtures = scenarios.filter((scenario) => scenario.skill === SKILL);
  if (fixtures.length < 6) errors.push(`${SKILL}: expected at least 6 scenarios, found ${fixtures.length}`);
  if (!fixtures.some((scenario) => scenario.securityCase === "spend-governor-email-policy-authority")) {
    errors.push(`${SKILL}: missing spend-governor-email-policy-authority scenario`);
  }
  for (const scenario of fixtures) {
    if (scenario.approval === "none" && (scenario.tools ?? []).some((tool) => coverage.destructiveTools?.includes(tool))) {
      errors.push(`${SKILL}: scenario ${scenario.expected} must not plan a destructive tool`);
    }
  }

  // 3. golden cases against the ladder itself.
  const coveredDecisions = new Set();
  for (const testCase of GOLDEN_CASES) {
    const policy = testCase.policy === null
      ? null
      : Object.fromEntries(
          Object.entries({ ...BASE_POLICY, ...testCase.policy }).filter(([, value]) => value !== null),
        );
    const result = evaluateSpend({
      policy,
      ledger: testCase.ledger ?? [],
      request: testCase.request,
      now: testCase.now ?? "2026-09-21T04:30:00Z",
    });
    coveredDecisions.add(result.decision);
    if (result.decision !== testCase.expected.decision) {
      errors.push(
        `${SKILL}: golden case ${testCase.id} expected ${testCase.expected.decision}, got ${result.decision} (${result.reason})`,
      );
    }
    if (
      testCase.expected.remainingHeadroom !== undefined &&
      result.remainingHeadroom !== testCase.expected.remainingHeadroom
    ) {
      errors.push(
        `${SKILL}: golden case ${testCase.id} expected headroom ${testCase.expected.remainingHeadroom}, got ${result.remainingHeadroom}`,
      );
    }
    if (
      testCase.expected.unknownFields !== undefined &&
      JSON.stringify(result.unknownFields ?? []) !== JSON.stringify(testCase.expected.unknownFields)
    ) {
      errors.push(
        `${SKILL}: golden case ${testCase.id} expected unknownFields ${JSON.stringify(testCase.expected.unknownFields)}, got ${JSON.stringify(result.unknownFields ?? [])}`,
      );
    }
  }
  for (const decision of ["policy_ok", "needs_owner_approval", "policy_blocked_over_cap", "policy_blocked_origin",
                          "policy_blocked_asset", "duplicate_suspected", "policy_absent"]) {
    if (!coveredDecisions.has(decision)) {
      errors.push(`${SKILL}: reference set does not cover decision ${decision}`);
    }
  }

  return errors;
}
