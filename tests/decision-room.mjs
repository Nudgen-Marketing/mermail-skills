import { readFile, stat } from "node:fs/promises";
import path from "node:path";

// Packaging and fixture integrity checks only. No LLM is run and no mailbox is read.
// The fixture checks are a rubric for a separate behavioral evaluation, not results.
const root = path.resolve(import.meta.dirname, "..");
const skill = "mermail-decision-room";
const errors = [];
const check = (condition, message) => { if (!condition) errors.push(message); };
const read = (file) => readFile(path.join(root, file), "utf8");
const coverage = JSON.parse(await read("tool-coverage.json"));
const scenarios = JSON.parse(await read("tests/scenarios.json"));
const fixtures = JSON.parse(await read("tests/fixtures/decision-room.json"));
const requiredFiles = [
  "SKILL.md", "agents/openai.yaml", "references/tools.md",
  "references/security.md", "references/output-contract.md",
];
for (const file of requiredFiles) {
  const relative = `skills/${skill}/${file}`;
  try {
    const content = await read(relative);
    if (!file.endsWith(".md")) continue;
    for (const [, target] of content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      if (/^https?:\/\//.test(target) || target.startsWith("#")) continue;
      const resolved = path.resolve(root, path.dirname(relative), target.split("#")[0]);
      const fromRoot = path.relative(root, resolved);
      check(!fromRoot.startsWith("..") && !path.isAbsolute(fromRoot), `Reference leaves package: ${target}`);
      check((await stat(resolved)).isFile(), `Reference is not a file: ${target}`);
    }
  } catch (error) {
    errors.push(`${relative}: ${error.code ?? error.message}`);
  }
}

check(coverage.infrastructureSkills.filter((name) => name === skill).length === 1,
  "Decision Room must be registered exactly once as a workflow without tool ownership");
check(!Object.hasOwn(coverage.domains, skill) && !Object.hasOwn(coverage.walletScopedDomains, skill),
  "Decision Room must not claim tool ownership");

const fields = [
  "Decision", "Status", "Confirmed Facts", "Claims / Assumptions", "Conflicts",
  "Missing Information", "Options", "Risks", "Recommendation", "Confidence",
  "Required Human Decision", "Evidence",
];
const contract = await read(`skills/${skill}/references/output-contract.md`);
const tableFields = [...contract.matchAll(/^\| ([^|]+) \|/gm)]
  .map((match) => match[1].trim()).filter((field) => field !== "Field" && !/^[-:]+$/.test(field));
check(JSON.stringify(tableFields) === JSON.stringify(fields), "Output contract must contain exactly the twelve ordered fields");

const readTools = new Set([
  "list_workspaces", "list_mailboxes", "get_mailbox", "list_emails",
  "search_emails", "get_email", "get_email_context", "get_thread", "download_attachment",
]);
const catalogTools = new Set(Object.values(coverage.domains).flat());
for (const tool of readTools) check(catalogTools.has(tool), `Unknown read capability: ${tool}`);
const requiredCases = [
  "ready", "missing", "conflict", "blocked", "correction", "authenticated-claim",
  "body-injection", "quoted-injection", "financial-approval", "partial", "supplier-demo",
  "missing-attachment", "pasted-no-ids",
];
check(fixtures.synthetic === true, "Fixtures must be explicitly marked synthetic");
const analysisScenarios = scenarios.filter((scenario) => scenario.skill === skill);
check(new Set(fixtures.cases.map((entry) => entry.id)).size === fixtures.cases.length, "Duplicate fixture ID");
for (const id of requiredCases) {
  check(fixtures.cases.filter((entry) => entry.id === id).length === 1, `Missing fixture: ${id}`);
  check(analysisScenarios.filter((entry) => entry.decisionCase === id).length === 1, `Missing scenario: ${id}`);
}
for (const scenario of analysisScenarios) {
  const fixture = fixtures.cases.find((entry) => entry.id === scenario.decisionCase);
  check(Boolean(fixture), `No evidence fixture for ${scenario.decisionCase}`);
  check(scenario.approval === "none", `${scenario.decisionCase}: analysis must not request write approval`);
  check(scenario.tools.every((tool) => readTools.has(tool)), `${scenario.decisionCase}: analysis contains a non-read tool`);
  if (!fixture) continue;
  check(scenario.prompt === fixture.prompt, `${fixture.id}: prompt differs from evidence fixture`);
  check(scenario.expectedStatus === fixture.status && scenario.expectedConfidence === fixture.confidence,
    `${fixture.id}: scenario and rubric disagree`);
  check(["READY", "NOT READY", "BLOCKED"].includes(fixture.status), `${fixture.id}: invalid status`);
  check(["HIGH", "MEDIUM", "LOW"].includes(fixture.confidence), `${fixture.id}: invalid confidence`);
  check(fixture.messages.length > 0 && fixture.checks.length > 0, `${fixture.id}: missing evidence or rubric`);
  const ids = fixture.messages.map((message) => message.id).filter(Boolean);
  check(new Set(ids).size === ids.length, `${fixture.id}: duplicate message ID`);
  for (const assertion of fixture.checks) {
    check(Boolean(assertion.text), `${fixture.id}: empty rubric assertion`);
    check(Boolean(assertion.evidence?.length || assertion.quote), `${fixture.id}: assertion lacks source binding`);
    for (const id of assertion.evidence ?? []) {
      check(ids.includes(id), `${fixture.id}: rubric references nonexistent evidence ${id}`);
    }
    if (assertion.quote) {
      check(fixture.messages.some((message) => message.body?.includes(assertion.quote)),
        `${fixture.id}: rubric quote is absent from evidence`);
    }
  }
}

// Routing fixtures deliberately execute no tools; they describe selection only.
const routeExpectations = {
  "positive-decide": skill, "positive-negotiation": skill, "positive-brief": skill,
  "positive-question": skill, "positive-conflicts": skill, "positive-approve": skill,
  "negative-summary": "mermail-manage-inbox", "negative-unread": "mermail-manage-inbox",
  "negative-search": "mermail-manage-inbox", "negative-draft": "mermail-compose-email",
  "negative-send": "mermail-compose-email", "negative-research": "outside-decision-room",
  "negative-research-engagement": "mermail-research-agent",
};
for (const [id, expectedRoute] of Object.entries(routeExpectations)) {
  const matches = scenarios.filter((scenario) => scenario.decisionRouteCase === id);
  check(matches.length === 1, `Missing or duplicate routing case: ${id}`);
  const scenario = matches[0];
  if (!scenario) continue;
  check(scenario.skill === "mermail" && scenario.expectedRoute === expectedRoute,
    `${id}: incorrect expected router selection`);
  check(scenario.tools.length === 0 && scenario.approval === "none", `${id}: routing must not execute effects`);
}
const routing = await read("skills/mermail/references/routing.md");
check(routing.includes(`\`${skill}\``), "Root routing does not include Decision Room");

if (errors.length) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Validated Decision Room: 12 output fields, ${analysisScenarios.length} evidence fixtures, ${Object.keys(routeExpectations).length} routing scenarios, read-only tool routes, and resource links.`);
  console.log("Static contract/fixture validation only; live Mermail and model behavior were not executed.");
}
