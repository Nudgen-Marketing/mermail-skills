import { readFile, stat } from "node:fs/promises";
import path from "node:path";

export async function validateInvoiceAgent(root, scenarios, coverage) {
  const errors = [];
  const skill = "mermail-invoice-agent";
  const skillRoot = path.join(root, "skills", skill);
  const requiredFiles = [
    "SKILL.md",
    "agents/openai.yaml",
    "references/tools.md",
    "references/workflows.md",
    "references/security.md",
    "references/templates.md",
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
        if (!(await stat(resolved)).isFile()) {
          errors.push(`${skill}: invalid reference ${target}`);
        }
      }
    } catch (error) {
      errors.push(`${skill}: missing or unreadable resource in ${file}: ${error.code ?? error.message}`);
    }
  }

  const requiredCases = [
    "micro-settlement",
    "high-value-approval",
    "insufficient-funds",
    "duplicate-invoice",
    "unverified-sender",
  ];

  const fixtures = scenarios.filter((scenario) => scenario.skill === skill);
  for (const caseId of requiredCases) {
    const matches = fixtures.filter((scenario) => scenario.invoiceCase === caseId);
    if (matches.length !== 1) {
      errors.push(`${skill}: expected one ${caseId} scenario`);
    }
  }

  for (const scenario of fixtures) {
    if (!scenario.expected || !scenario.prompt || !scenario.invoiceCase) {
      errors.push(`${skill}: incomplete invoice scenario`);
    }
    if (scenario.invoiceCase === "unverified-sender" && scenario.tools.includes("paybox_request_transfer")) {
      errors.push(`${skill}: unverified-sender must never transfer funds`);
    }
    if (scenario.invoiceCase === "high-value-approval" && !scenario.expected.includes("approval")) {
      errors.push(`${skill}: high-value-approval must expect owner approval`);
    }
    if (scenario.invoiceCase === "micro-settlement" && !scenario.tools.includes("reply_to_email")) {
      errors.push(`${skill}: micro-settlement must include receipt reply`);
    }
  }

  return errors;
}
