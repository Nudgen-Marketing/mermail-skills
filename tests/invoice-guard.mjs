import { readFile, stat } from "node:fs/promises";
import path from "node:path";

export async function validateInvoiceGuard(root, scenarios, coverage) {
  const errors = [];
  const skill = "mermail-invoice-guard";
  const skillRoot = path.join(root, "skills", skill);
  const requiredFiles = [
    "SKILL.md",
    "agents/openai.yaml",
    "references/tools.md",
    "references/risk-model.md",
    "references/security.md",
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

  const corpus = [...contents.values()].join("\n");
  for (const required of [
    "owner-supplied payment policy",
    "`scan_status: clean`",
    "`sender_authentication.status: pass`",
    "untrusted data",
    "`policy_match`",
    "`needs_policy`",
    "never executes Agent Wallet / PayBox writes",
    "A low score means only",
  ]) {
    if (!corpus.includes(required)) errors.push(`${skill}: missing invariant ${required}`);
  }

  const requiredCases = ["happy-path", "draft", "injection", "payee-change", "missing-policy", "duplicate"];
  const fixtures = scenarios.filter((scenario) => scenario.skill === skill);
  for (const caseId of requiredCases) {
    const matches = fixtures.filter((scenario) => scenario.invoiceCase === caseId);
    if (matches.length !== 1) errors.push(`${skill}: expected one ${caseId} scenario`);
  }

  const forbiddenEffects = new Set([
    ...coverage.externalEffectTools,
    ...coverage.destructiveTools,
    ...(coverage.walletDestructiveTools ?? []),
  ]);
  for (const scenario of fixtures) {
    if (!scenario.expected || !scenario.prompt || !scenario.invoiceCase) {
      errors.push(`${skill}: incomplete invoice scenario`);
    }
    for (const forbidden of scenario.forbiddenTools ?? []) {
      if (scenario.tools.includes(forbidden)) {
        errors.push(`${skill}: ${scenario.invoiceCase} includes forbidden ${forbidden}`);
      }
    }
    if (scenario.tools.some((tool) => forbiddenEffects.has(tool))) {
      errors.push(`${skill}: ${scenario.invoiceCase} must remain non-payment and non-delivery`);
    }
  }

  return errors;
}
