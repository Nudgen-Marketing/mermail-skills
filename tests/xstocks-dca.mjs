import { stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import controlsChecks from "./xstocks-dca/controls.checks.mjs";
import core from "./xstocks-dca/core.checks.mjs";
import ledgerChecks from "./xstocks-dca/ledger.checks.mjs";
import mandateChecks from "./xstocks-dca/mandate.checks.mjs";
import plannerChecks from "./xstocks-dca/planner.checks.mjs";
import settlementChecks from "./xstocks-dca/settlement.checks.mjs";

// Engine checks for scripts/dca.mjs. These exercise the deterministic money logic,
// not a live wallet: network access is replaced by recorded fixtures.
const SUITES = { core, mandate: mandateChecks, ledger: ledgerChecks, controls: controlsChecks, planner: plannerChecks, settlement: settlementChecks };

export async function runEngineChecks() {
  let total = 0;
  const failures = [];
  for (const [suite, checks] of Object.entries(SUITES)) {
    for (const [name, fn] of checks) {
      total += 1;
      try {
        await fn();
      } catch (error) {
        failures.push(`${suite} > ${name}: ${error.message}`);
      }
    }
  }
  return { total, failures };
}

export async function validateXstocksDca(root, scenarios, coverage) {
  const errors = [];
  const skill = "mermail-xstocks-dca";
  const skillRoot = path.join(root, "skills", skill);
  for (const file of [
    "SKILL.md", "agents/openai.yaml", "references/tools.md", "references/workflows.md",
    "references/security.md", "references/templates.md", "references/scheduling.md", "scripts/dca.mjs",
  ]) {
    try {
      await stat(path.join(skillRoot, file));
    } catch {
      errors.push(`${skill}: missing ${file}`);
    }
  }
  if (!coverage.infrastructureSkills.includes(skill)) {
    errors.push(`${skill}: must be listed in infrastructureSkills because it owns no tools`);
  }
  const own = scenarios.filter((scenario) => scenario.skill === skill);
  if (own.length < 10) errors.push(`${skill}: expected at least 10 scenarios, found ${own.length}`);
  for (const scenario of own) {
    const tools = scenario.tools ?? [];
    for (const forbidden of ["paybox_pay_x402", "paybox_request_transfer", "paybox_use_plugin", "prepare_destructive_action"]) {
      if (tools.includes(forbidden)) errors.push(`${skill}: ${scenario.expected} must not use ${forbidden}`);
    }
    if (scenario.securityCase && tools.includes("paybox_request_swap")) {
      errors.push(`${skill}: security case ${scenario.expected} must not buy`);
    }
  }
  const { failures } = await runEngineChecks();
  errors.push(...failures.map((failure) => `${skill} engine: ${failure}`));
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const { total, failures } = await runEngineChecks();
  for (const failure of failures) console.error(failure);
  console.log(`${total - failures.length}/${total} engine checks passed`);
  process.exitCode = failures.length ? 1 : 0;
}
