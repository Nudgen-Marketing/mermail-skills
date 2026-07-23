import { readFile, readdir, stat } from "node:fs/promises";
import process from "node:process";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const skillsRoot = path.join(root, "skills");
const coverage = JSON.parse(await readFile(path.join(root, "tool-coverage.json"), "utf8"));
const scenarios = JSON.parse(await readFile(path.join(root, "tests", "scenarios.json"), "utf8"));
const expectedSkills = [...coverage.infrastructureSkills, ...Object.keys(coverage.domains)].sort();
const errors = [];

const skillNames = (
  await Promise.all(
    (await readdir(skillsRoot)).map(async (name) => {
      const full = path.join(skillsRoot, name);
      return (await stat(full)).isDirectory() ? name : null;
    }),
  )
)
  .filter(Boolean)
  .sort();
if (JSON.stringify(skillNames) !== JSON.stringify(expectedSkills)) {
  errors.push(`skills mismatch: expected ${expectedSkills.join(", ")}; found ${skillNames.join(", ")}`);
}

for (const skillName of skillNames) {
  const skillDir = path.join(skillsRoot, skillName);
  const markdown = await readFile(path.join(skillDir, "SKILL.md"), "utf8");
  const frontmatter = markdown.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatter) {
    errors.push(`${skillName}: missing YAML frontmatter`);
    continue;
  }
  const keys = [...frontmatter[1].matchAll(/^([a-zA-Z0-9_-]+):/gm)].map((match) => match[1]);
  const allowed = new Set(["name", "description", "metadata"]);
  if (!keys.includes("name") || !keys.includes("description")) {
    errors.push(`${skillName}: frontmatter must include name and description`);
  }
  for (const key of keys) {
    if (!allowed.has(key)) errors.push(`${skillName}: unexpected frontmatter key ${key}`);
  }
  if (!frontmatter[1].includes(`name: ${skillName}\n`)) errors.push(`${skillName}: name must match directory`);
  if (!frontmatter[1].includes("metadata:\n  openclaw:")) {
    errors.push(`${skillName}: missing metadata.openclaw for ClawHub`);
  }
  if (!frontmatter[1].includes("primaryEnv: MERMAIL_API_KEY")) {
    errors.push(`${skillName}: metadata.openclaw.primaryEnv must be MERMAIL_API_KEY`);
  }
  if (!frontmatter[1].includes("- MERMAIL_API_KEY")) {
    errors.push(`${skillName}: metadata.openclaw.requires.env must include MERMAIL_API_KEY`);
  }
  if (markdown.includes("TODO")) errors.push(`${skillName}: unresolved TODO`);
  if (markdown.split("\n").length > 500) errors.push(`${skillName}: SKILL.md exceeds 500 lines`);

  const metadataPath = path.join(skillDir, "agents", "openai.yaml");
  const metadata = await readFile(metadataPath, "utf8");
  for (const required of ["display_name:", "short_description:", `default_prompt: \"Use $${skillName}`, "type: \"mcp\"", `url: \"${coverage.mcpEndpoint}\"`]) {
    if (!metadata.includes(required)) errors.push(`${skillName}: openai.yaml missing ${required}`);
  }
}

const agentInboxDir = path.join(skillsRoot, "mermail-agent-inbox");
const agentInboxSkill = await readFile(path.join(agentInboxDir, "SKILL.md"), "utf8");
const agentInboxTools = await readFile(path.join(agentInboxDir, "references", "tools.md"), "utf8");
const agentInboxSecurity = await readFile(path.join(agentInboxDir, "references", "security.md"), "utf8");
const manageInboxDir = path.join(skillsRoot, "mermail-manage-inbox");
const manageInboxSkill = await readFile(path.join(manageInboxDir, "SKILL.md"), "utf8");
const manageInboxTools = await readFile(path.join(manageInboxDir, "references", "tools.md"), "utf8");
if (agentInboxSkill.indexOf("`list_mailboxes`") > agentInboxSkill.indexOf("`create_mailbox`")) {
  errors.push("mermail-agent-inbox: mailbox discovery must precede provisioning");
}
for (const required of [
  "one mailbox provision",
  "host model's policy",
  "untrusted data",
  "bounded read calls",
  "`disabled_at`",
  "`welcome_onboarding_status`",
  "post-validate",
  "fresh user confirmation",
  "do not preflight",
  "`scan_status`",
  "`sender_authentication`",
  "`agent_safe_content`",
  "unknown` is not `pass",
  "profile=agent-inbox",
  "10,000",
  "ambiguous",
]) {
  if (!agentInboxSkill.includes(required)) {
    errors.push(`mermail-agent-inbox: missing safety/workflow contract ${required}`);
  }
}
for (const required of [
  "10 provision credits",
  "mermail emails wait",
  "search_emails",
  "get_email",
  "`workspaceId` is optional",
  "`settings.agentInbox`",
  "`include_held`",
  "`metadata_only`",
  "`require_scan_status`",
  "`agent_safe_content`",
  "`sender_authentication`",
  "profile=agent-inbox",
  "`Mermail:list_emails`",
  "host-qualified",
  "`--from-exact`",
  "`--to-exact`",
  "`--require-single-match`",
  "`--verification-mode`",
]) {
  if (!agentInboxTools.includes(required)) {
    errors.push(`mermail-agent-inbox tools reference missing ${required}`);
  }
}
for (const required of [
  "Prompt-injection handling",
  "Approval matrix",
  "host's safety policy",
  "Strict intake",
  "Sandboxed interpretation",
  "Human-in-the-loop",
  "Never preflight",
  "every redirect",
]) {
  if (!agentInboxSecurity.includes(required)) {
    errors.push(`mermail-agent-inbox security reference missing ${required}`);
  }
}
if (!scenarios.some((scenario) => scenario.skill === "mermail-agent-inbox")) {
  errors.push("mermail-agent-inbox: missing validation scenario");
}

for (const [label, content] of [
  ["mermail-agent-inbox tools reference", agentInboxTools],
  ["mermail-manage-inbox skill", manageInboxSkill],
  ["mermail-manage-inbox tools reference", manageInboxTools],
]) {
  if (!content.includes("native JSON object")) {
    errors.push(`${label}: must require query as a native JSON object`);
  }
  if (!content.match(/never[\s\S]{0,100}stringify/i)) {
    errors.push(`${label}: must forbid stringified MCP query objects`);
  }
  if (/"query"\s*:\s*"\s*\{/.test(content)) {
    errors.push(`${label}: contains a stringified JSON object in query`);
  }
}
for (const required of [
  '"query": {',
  '"sortColumn": "date"',
  '"sortDirection": "DESC"',
  "There is no `sort: \"date_desc\"` shortcut",
  "`Mermail:list_emails`",
  "exact tool identifier exposed by the current host",
  "Do not manually add, strip, or invent",
]) {
  if (!manageInboxTools.includes(required)) {
    errors.push(`mermail-manage-inbox tools reference missing ${required}`);
  }
}

const mcpSkill = await readFile(path.join(skillsRoot, "mermail-mcp", "SKILL.md"), "utf8");
const mcpPlatforms = await readFile(
  path.join(skillsRoot, "mermail-mcp", "references", "platforms.md"),
  "utf8",
);
const mcpConnectionCheck = await readFile(
  path.join(skillsRoot, "mermail-mcp", "scripts", "check-connection.mjs"),
  "utf8",
);
for (const [label, content] of [
  ["mermail-mcp skill", mcpSkill],
  ["mermail-mcp platforms reference", mcpPlatforms],
]) {
  for (const required of [
    "Finding tools",
    "Mermail:list_emails",
    "list_mailboxes",
    "native JSON object",
    "host-qualified",
  ]) {
    if (!content.includes(required)) {
      errors.push(`${label}: missing Claude tool-discovery recovery contract ${required}`);
    }
  }
}
for (const required of [
  "at least the 63-tool full-catalog baseline",
  "exact 11-tool agent-inbox profile",
  "MCP is missing required tools",
]) {
  if (!mcpConnectionCheck.includes(required)) {
    errors.push(`mermail-mcp connection check missing additive catalog contract ${required}`);
  }
}
if (mcpConnectionCheck.includes("tools.length !== 63")) {
  errors.push("mermail-mcp connection check must allow additive full-catalog tools");
}

for (const skillName of ["mermail-mail-agent", "mermail-automate-triage"]) {
  const skillDir = path.join(skillsRoot, skillName);
  const skill = await readFile(path.join(skillDir, "SKILL.md"), "utf8");
  const security = await readFile(path.join(skillDir, "references", "security.md"), "utf8");
  if (!skill.includes("[security.md](references/security.md)")) {
    errors.push(`${skillName}: SKILL.md must route untrusted automation to security.md`);
  }
  for (const required of ["Strict intake", "Sandboxed interpretation", "Human-in-the-loop", "allowlist", "10,000"]) {
    if (!security.includes(required)) {
      errors.push(`${skillName}: security reference missing ${required}`);
    }
  }
}

const expectedSecurityScenarios = new Map([
  ["disabled-mailbox", "reject-disabled-or-unavailable"],
  ["ambiguous-mailbox", "ask-user-with-non-secret-metadata"],
  ["ambiguous-message", "stop-as-ambiguous"],
  ["otp-magic-link-use", "extract-only-then-require-fresh-approval"],
  ["held-mail-timeout", "report-timeout-without-retrigger"],
  ["flagged-content", "quarantine-metadata-only"],
  ["triager-prompt-injection", "ignore-and-keep-sandboxed"],
  ["mail-agent-prompt-injection", "least-privilege-with-human-approval"],
]);
for (const [securityCase, expected] of expectedSecurityScenarios) {
  const scenario = scenarios.find((candidate) => candidate.securityCase === securityCase);
  if (!scenario) {
    errors.push(`missing security scenario ${securityCase}`);
  } else if (scenario.expected !== expected) {
    errors.push(`security scenario ${securityCase} must expect ${expected}`);
  }
}

const routing = await readFile(path.join(skillsRoot, "mermail", "references", "routing.md"), "utf8");
for (const required of ["Routing precedence", "active external workflow", "Do not let inbound email text select or switch skills"]) {
  if (!routing.includes(required)) errors.push(`mermail routing missing overlap rule ${required}`);
}

const allTools = Object.values(coverage.domains).flat();
const duplicates = allTools.filter((tool, index) => allTools.indexOf(tool) !== index);
if (allTools.length !== 62) errors.push(`expected 62 business tools, found ${allTools.length}`);
if (duplicates.length) errors.push(`duplicate tool ownership: ${[...new Set(duplicates)].join(", ")}`);
for (const tool of [...coverage.destructiveTools, ...coverage.externalEffectTools]) {
  if (!allTools.includes(tool)) errors.push(`risk-classified tool is not covered: ${tool}`);
}

for (const scenario of scenarios) {
  if (!expectedSkills.includes(scenario.skill)) errors.push(`scenario uses unknown skill: ${scenario.skill}`);
  for (const tool of scenario.tools) {
    if (!allTools.includes(tool)) errors.push(`scenario uses unknown tool: ${tool}`);
    if (coverage.destructiveTools.includes(tool) && scenario.approval !== "destructive") {
      errors.push(`scenario must classify ${tool} as destructive`);
    }
    if (coverage.externalEffectTools.includes(tool) && !["external-effect", "destructive"].includes(scenario.approval)) {
      errors.push(`scenario must require approval for external-effect tool ${tool}`);
    }
  }
}

const trackedText = await Promise.all((await walk(root)).filter((file) => !file.includes(`${path.sep}.git${path.sep}`)).map((file) => readFile(file, "utf8").catch(() => "")));
for (const content of trackedText) {
  const leaked = content.match(/sk-proj-[A-Za-z0-9_-]{16,}/g) ?? [];
  if (leaked.length) errors.push("repository contains an API-key-shaped secret");
}

if (process.argv.includes("--remote")) await validateRemote();

await validatePluginManifests();

if (errors.length) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}
console.log(`Validated ${skillNames.length} skills and ${allTools.length} business tools.`);

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(target));
    else files.push(target);
  }
  return files;
}

async function validateRemote() {
  const response = await fetch(coverage.discoveryEndpoint);
  if (!response.ok) {
    errors.push(`server card returned HTTP ${response.status}`);
    return;
  }
  const card = await response.json();
  const remoteTools = [...(card.capabilities?.tools?.list ?? [])].sort();
  const localTools = [coverage.confirmationTool, ...allTools].sort();
  if (JSON.stringify(remoteTools) !== JSON.stringify(localTools)) {
    errors.push("production MCP tool catalog differs from tool-coverage.json");
  }

  const unauthenticated = await fetch(coverage.mcpEndpoint, {
    method: "POST",
    headers: { accept: "application/json, text/event-stream", "content-type": "application/json" },
    body: JSON.stringify(initializePayload(0))
  });
  if (unauthenticated.status !== 401) errors.push(`unauthenticated MCP request returned HTTP ${unauthenticated.status}, expected 401`);

  const apiKey = process.env.MERMAIL_MCP_TEST_API_KEY;
  if (!apiKey) return;
  const initialized = await authenticatedMcpRequest(apiKey, initializePayload(1));
  if (!initialized?.result?.serverInfo) errors.push("authenticated MCP initialize did not return serverInfo");
  const listed = await authenticatedMcpRequest(apiKey, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  const remoteNames = (listed?.result?.tools ?? []).map((tool) => tool.name);
  if (remoteNames.length !== 63) {
    errors.push(`authenticated tools/list returned ${remoteNames.length} tools, expected 63`);
  }
  if (!remoteNames.includes(coverage.confirmationTool)) {
    errors.push(`authenticated tools/list missing ${coverage.confirmationTool}`);
  }

  const workspaces = await authenticatedMcpRequest(apiKey, {
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "list_workspaces", arguments: {} },
  });
  if (!workspaces) {
    errors.push("authenticated list_workspaces tools/call failed");
  } else if (workspaces.result?.isError) {
    errors.push("authenticated list_workspaces returned isError");
  } else if (!workspaces.result?.structuredContent && !workspaces.result?.content) {
    errors.push("authenticated list_workspaces returned empty content");
  }
}

function initializePayload(id) {
  return {
    jsonrpc: "2.0",
    id,
    method: "initialize",
    params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "mermail-skills-ci", version: "1.2.1" } }
  };
}

async function authenticatedMcpRequest(apiKey, body) {
  const response = await fetch(coverage.mcpEndpoint, {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      "x-api-key": apiKey
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    errors.push(`authenticated MCP ${body.method} returned HTTP ${response.status}`);
    return null;
  }
  return response.json();
}

async function validatePluginManifests() {
  const version = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")).version;
  const manifests = [
    ".codex-plugin/plugin.json",
    ".claude-plugin/plugin.json",
    ".cursor-plugin/plugin.json",
    ".plugin/plugin.json"
  ];
  for (const relative of manifests) {
    const manifest = JSON.parse(await readFile(path.join(root, relative), "utf8"));
    if (manifest.name !== "mermail") errors.push(`${relative}: plugin name must be mermail`);
    if (manifest.version !== version) errors.push(`${relative}: version must match package.json`);
  }

  const codex = JSON.parse(await readFile(path.join(root, ".codex-plugin/plugin.json"), "utf8"));
  if (codex.mcpServers !== "./.codex-plugin/mcp.json") {
    errors.push(".codex-plugin/plugin.json: mcpServers must point at ./.codex-plugin/mcp.json");
  }
  if (codex.license !== "MIT") {
    errors.push(".codex-plugin/plugin.json: license must be MIT");
  }
  const codexMcp = JSON.parse(await readFile(path.join(root, ".codex-plugin/mcp.json"), "utf8"));
  if (codexMcp.mermail?.type !== "http") {
    errors.push("Codex MCP config must use the http transport");
  }
  if (codexMcp.mermail?.url !== coverage.mcpEndpoint) {
    errors.push(`Codex MCP config URL must be ${coverage.mcpEndpoint}`);
  }
  if (codexMcp.mermail?.env_http_headers?.["x-api-key"] !== "MERMAIL_API_KEY") {
    errors.push("Codex MCP config must map MERMAIL_API_KEY through env_http_headers");
  }
  if (codex.interface?.logo !== "./assets/logo.png") {
    errors.push(".codex-plugin/plugin.json: interface.logo must be ./assets/logo.png");
  }
  if (codex.interface?.composerIcon !== "./assets/icon.png") {
    errors.push(".codex-plugin/plugin.json: interface.composerIcon must be ./assets/icon.png");
  }
  if (codex.interface?.shortDescription === "Connect Codex to Mermail.") {
    errors.push(".codex-plugin/plugin.json: shortDescription must not use the Codex default placeholder");
  }
  const screenshots = codex.interface?.screenshots ?? [];
  if (!Array.isArray(screenshots) || screenshots.length < 1) {
    errors.push(".codex-plugin/plugin.json: interface.screenshots must list at least one PNG under ./assets/");
  }
  for (const shot of screenshots) {
    if (typeof shot !== "string" || !shot.startsWith("./assets/") || !shot.endsWith(".png")) {
      errors.push(`.codex-plugin/plugin.json: invalid screenshot path ${shot}`);
      continue;
    }
    try {
      await stat(path.join(root, shot.slice(2)));
    } catch {
      errors.push(`missing screenshot asset: ${shot}`);
    }
  }
  if (codex.apps) {
    try {
      await stat(path.join(root, ".app.json"));
    } catch {
      errors.push(".codex-plugin/plugin.json declares apps but .app.json is missing (fill from .app.json.example after OpenAI connector id)");
    }
  }
  try {
    await stat(path.join(root, "assets", "icon.png"));
  } catch {
    errors.push("assets/icon.png is required for Codex plugin branding");
  }
  try {
    await stat(path.join(root, "assets", "logo.png"));
  } catch {
    errors.push("assets/logo.png is required for Codex plugin branding");
  }
  try {
    await stat(path.join(root, "CODEX_MARKETPLACE.md"));
  } catch {
    errors.push("CODEX_MARKETPLACE.md is required for OpenAI Plugins Directory submission");
  }
  try {
    await stat(path.join(root, "PORTAL_SUBMISSION.md"));
  } catch {
    errors.push("PORTAL_SUBMISSION.md is required for Phase 3 portal paste pack");
  }
  try {
    await stat(path.join(root, "scripts", "build-openai-skills-zip.sh"));
  } catch {
    errors.push("scripts/build-openai-skills-zip.sh is required to build the OpenAI skills ZIP");
  }

  const genericManifest = JSON.parse(
    await readFile(path.join(root, ".plugin/plugin.json"), "utf8"),
  );
  if (genericManifest.skills !== "./skills/") {
    errors.push(".plugin/plugin.json: skills must point at ./skills/");
  }
  if (genericManifest.mcpServers !== "./.mcp.json") {
    errors.push(".plugin/plugin.json: mcpServers must point at ./.mcp.json");
  }

  const genericMcp = JSON.parse(await readFile(path.join(root, ".mcp.json"), "utf8"));
  if (genericMcp.mcpServers?.mermail?.type !== "http") {
    errors.push("Generic/Claude MCP config must use the http transport");
  }
  if (genericMcp.mcpServers?.mermail?.url !== coverage.mcpEndpoint) {
    errors.push(`Generic/Claude MCP config URL must be ${coverage.mcpEndpoint}`);
  }
  if (genericMcp.mcpServers?.mermail?.headers?.["x-api-key"] !== "${MERMAIL_API_KEY}") {
    errors.push("Claude MCP config must expand MERMAIL_API_KEY in x-api-key");
  }

  const claudeMarketplace = JSON.parse(
    await readFile(path.join(root, ".claude-plugin/marketplace.json"), "utf8"),
  );
  const claudeListing = claudeMarketplace.plugins?.find(
    (plugin) => plugin.name === "mermail",
  );
  if (claudeMarketplace.name !== "mermail" || claudeListing?.source !== "./") {
    errors.push("Claude marketplace must expose the local mermail plugin from ./");
  }

  const cursorManifest = JSON.parse(
    await readFile(path.join(root, ".cursor-plugin/plugin.json"), "utf8"),
  );
  if (cursorManifest.displayName !== "Mermail") {
    errors.push(".cursor-plugin/plugin.json: displayName must be Mermail");
  }
  if (cursorManifest.license !== "MIT") {
    errors.push(".cursor-plugin/plugin.json: license must be MIT");
  }
  if (cursorManifest.logo !== "assets/logo.svg") {
    errors.push(".cursor-plugin/plugin.json: logo must be assets/logo.svg");
  }
  if (cursorManifest.mcpServers !== "./.cursor-plugin/mcp.json") {
    errors.push(".cursor-plugin/plugin.json: mcpServers path must point at .cursor-plugin/mcp.json");
  }
  try {
    await stat(path.join(root, "assets", "logo.svg"));
  } catch {
    errors.push("assets/logo.svg is required for Cursor Marketplace");
  }
  try {
    await stat(path.join(root, "LICENSE"));
  } catch {
    errors.push("LICENSE is required for Cursor Marketplace (MIT)");
  }

  const cursor = JSON.parse(await readFile(path.join(root, ".cursor-plugin/mcp.json"), "utf8"));
  if (cursor.mcpServers?.mermail?.type !== "http") {
    errors.push("Cursor MCP config must use the http transport");
  }
  if (cursor.mcpServers?.mermail?.url !== coverage.mcpEndpoint) {
    errors.push(`Cursor MCP config URL must be ${coverage.mcpEndpoint}`);
  }
  if (cursor.mcpServers?.mermail?.headers?.["x-api-key"] !== "${env:MERMAIL_API_KEY}") {
    errors.push("Cursor MCP config must expand MERMAIL_API_KEY in x-api-key");
  }
}
