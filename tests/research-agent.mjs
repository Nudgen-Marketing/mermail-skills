import { readFile, stat } from "node:fs/promises";
import path from "node:path";

// These are fixture/packaging checks, not an agent execution or payment simulator.
export async function validateResearchAgent(root, scenarios, coverage) {
  const errors = [];
  const skill = "mermail-research-agent";
  const skillRoot = path.join(root, "skills", skill);
  const requiredFiles = [
    "SKILL.md", "agents/openai.yaml", "references/tools.md",
    "references/security.md", "references/workflows.md",
    "references/cmc-research.md", "references/templates.md",
  ];
  for (const file of requiredFiles) {
    try {
      const fullPath = path.join(skillRoot, file);
      const content = await readFile(fullPath, "utf8");
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

  const requiredCases = [
    "comparison", "market-report", "clarification", "identity-mismatch",
    "unverified-entitlement", "attachment-isolation", "recipient-change",
    "injection", "missing-cmc", "stale-data", "unverified-rights",
    "budget-exhausted", "protocol-mismatch", "uncertain-payment",
    "approved-purchase", "approved-reply", "uncertain-delivery",
    "duplicate-request", "follow-up", "scope-expansion", "api-key-wallet",
  ];
  const fixtures = scenarios.filter((scenario) => scenario.skill === skill);
  for (const caseId of requiredCases) {
    const matches = fixtures.filter((scenario) => scenario.researchCase === caseId);
    if (matches.length !== 1) errors.push(`${skill}: expected one ${caseId} scenario`);
  }
  const externalTools = new Set([
    ...coverage.externalEffectTools, ...coverage.destructiveTools,
    ...(coverage.walletDestructiveTools ?? []),
  ]);
  for (const scenario of fixtures) {
    if (!scenario.expected || !scenario.prompt || !scenario.researchCase) {
      errors.push(`${skill}: incomplete research scenario`);
    }
    for (const forbidden of scenario.forbiddenTools ?? []) {
      if (scenario.tools.includes(forbidden)) {
        errors.push(`${skill}: ${scenario.researchCase} includes forbidden ${forbidden}`);
      }
    }
    if (!["approved-purchase", "approved-reply"].includes(scenario.researchCase) &&
        scenario.tools.some((tool) => externalTools.has(tool))) {
      errors.push(`${skill}: ${scenario.researchCase} must not execute an external effect`);
    }
    if (scenario.researchCase === "approved-purchase" &&
        !scenario.tools.includes("paybox_pay_x402")) {
      errors.push(`${skill}: approved purchase must use the existing x402 payment tool`);
    }
    if (scenario.researchCase === "approved-reply" &&
        !scenario.tools.includes("reply_to_email")) {
      errors.push(`${skill}: approved delivery must preserve the reply path`);
    }
  }
  return errors;
}
