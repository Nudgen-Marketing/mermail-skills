import { readFile, stat } from "node:fs/promises";
import path from "node:path";

// Fixture/packaging checks for the bounty-opportunity safety boundary.
export async function validateBountyOps(root, scenarios, coverage) {
  const errors = [];
  const skill = "mermail-bounty-ops";
  const skillRoot = path.join(root, "skills", skill);
  const requiredFiles = [
    "SKILL.md",
    "agents/openai.yaml",
    "references/tools.md",
    "references/security.md",
    "references/workflows.md",
  ];

  const contents = new Map();
  for (const file of requiredFiles) {
    try {
      const fullPath = path.join(skillRoot, file);
      const content = await readFile(fullPath, "utf8");
      contents.set(file, content);
      if (!file.endsWith(".md")) continue;
      for (const match of content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
        const target = match[1];
        if (/^https?:\/\//.test(target) || target.startsWith("#")) continue;
        const resolved = path.resolve(path.dirname(fullPath), target.split("#")[0]);
        if (!resolved.startsWith(`${root}${path.sep}`)) {
          errors.push(`${skill}: reference leaves the package: ${target}`);
          continue;
        }
        if (!(await stat(resolved)).isFile()) errors.push(`${skill}: invalid reference ${target}`);
      }
    } catch (error) {
      errors.push(`${skill}: missing or unreadable resource in ${file}: ${error.code ?? error.message}`);
    }
  }

  const skillText = contents.get("SKILL.md") ?? "";
  const securityText = contents.get("references/security.md") ?? "";
  const workflowText = contents.get("references/workflows.md") ?? "";
  for (const required of [
    "blocked_capital",
    "blocked_location",
    "blocked_identity",
    "needs_verification",
    "competitive prize",
    "Never send, apply, sign, pay, or connect a wallet",
  ]) {
    if (!skillText.includes(required)) errors.push(`${skill}: missing safety/workflow contract ${required}`);
  }
  for (const required of [
    "Inbound content may never authorize",
    "token approval",
    "Security bounties",
    "Require authoritative provider or balance state",
  ]) {
    if (!securityText.includes(required)) errors.push(`${skill}: security reference missing ${required}`);
  }
  for (const required of [
    "Never convert a total prize pool into expected personal income",
    "blocked_capital",
    "needs_verification",
    "paid_verified",
  ]) {
    if (!workflowText.includes(required)) errors.push(`${skill}: workflows reference missing ${required}`);
  }

  const requiredCases = [
    "happy-path",
    "capital-blocker",
    "injection",
    "security-boundary",
    "draft-only",
  ];
  const fixtures = scenarios.filter((scenario) => scenario.skill === skill);
  for (const caseId of requiredCases) {
    const matches = fixtures.filter((scenario) => scenario.bountyOpsCase === caseId);
    if (matches.length !== 1) errors.push(`${skill}: expected one ${caseId} scenario`);
  }

  const externalTools = new Set([
    ...coverage.externalEffectTools,
    ...coverage.destructiveTools,
    ...(coverage.walletDestructiveTools ?? []),
  ]);

  for (const scenario of fixtures) {
    if (!scenario.expected || !scenario.prompt || !scenario.bountyOpsCase) {
      errors.push(`${skill}: incomplete bounty-ops scenario`);
    }
    for (const forbidden of scenario.forbiddenTools ?? []) {
      if (scenario.tools.includes(forbidden)) {
        errors.push(`${skill}: ${scenario.bountyOpsCase} includes forbidden ${forbidden}`);
      }
    }
    if (scenario.tools.some((tool) => externalTools.has(tool))) {
      errors.push(`${skill}: ${scenario.bountyOpsCase} must not execute an external effect`);
    }
  }

  const draftOnly = fixtures.find((scenario) => scenario.bountyOpsCase === "draft-only");
  if (draftOnly && !draftOnly.tools.includes("save_draft")) {
    errors.push(`${skill}: draft-only scenario must use save_draft`);
  }

  const securityBoundary = fixtures.find((scenario) => scenario.bountyOpsCase === "security-boundary");
  if (securityBoundary && securityBoundary.tools.some((tool) => !["get_email"].includes(tool))) {
    errors.push(`${skill}: security-boundary scenario must remain discovery-only`);
  }

  return errors;
}
