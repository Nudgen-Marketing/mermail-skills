import { readFile, stat } from "node:fs/promises";
import path from "node:path";

// These are fixture and contract checks, not an agent execution or booking simulator.
export async function validateTravelAgency(root, scenarios, coverage) {
  const errors = [];
  const skill = "mermail-travel-agency";
  const skillRoot = path.join(root, "skills", skill);
  const requiredFiles = [
    "SKILL.md",
    "agents/openai.yaml",
    "references/tools.md",
    "references/security.md",
    "references/workflows.md",
    "references/demo.md",
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
    "clarification",
    "complete-inquiry",
    "child-pricing",
    "missing-price-rule",
    "no-match",
    "expired-quote",
    "revision",
    "cross-thread",
    "injection",
    "recipient-change",
    "scan-blocked",
    "approved-reply",
    "uncertain-delivery",
    "booking-handoff",
  ];
  const fixtures = scenarios.filter((scenario) => scenario.skill === skill);
  for (const caseId of requiredCases) {
    const matches = fixtures.filter((scenario) => scenario.travelCase === caseId);
    if (matches.length !== 1) errors.push(`${skill}: expected one ${caseId} scenario`);
  }

  const externalTools = new Set([
    ...coverage.externalEffectTools,
    ...coverage.destructiveTools,
    ...(coverage.walletDestructiveTools ?? []),
  ]);
  for (const scenario of fixtures) {
    if (!scenario.prompt || !scenario.expected || !scenario.travelCase) {
      errors.push(`${skill}: incomplete travel scenario`);
    }
    for (const forbidden of scenario.forbiddenTools ?? []) {
      if (scenario.tools.includes(forbidden)) {
        errors.push(`${skill}: ${scenario.travelCase} includes forbidden ${forbidden}`);
      }
    }
    if (scenario.travelCase !== "approved-reply" &&
        scenario.tools.some((tool) => externalTools.has(tool))) {
      errors.push(`${skill}: ${scenario.travelCase} must not execute an external effect`);
    }
    if (scenario.travelCase === "approved-reply" &&
        !scenario.tools.includes("reply_to_email")) {
      errors.push(`${skill}: approved reply must use the existing same-thread reply tool`);
    }
  }

  const demo = await readFile(path.join(skillRoot, "references", "demo.md"), "utf8");
  for (const required of [
    "synthetic demo data",
    "DEMO ONLY",
    "Demo video",
    "Pending recording",
    "reply once in the original thread",
  ]) {
    if (!demo.includes(required)) errors.push(`${skill}: demo missing ${required}`);
  }

  return errors;
}
