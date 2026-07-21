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
  if (codex.mcpServers?.mermail?.env_http_headers?.["x-api-key"] !== "MERMAIL_API_KEY") {
    errors.push("Codex manifest must map MERMAIL_API_KEY through env_http_headers");
  }
  if (codex.interface?.logo !== "./assets/icon.png") {
    errors.push(".codex-plugin/plugin.json: interface.logo must be ./assets/icon.png");
  }
  if (codex.interface?.composerIcon !== "./assets/icon.png") {
    errors.push(".codex-plugin/plugin.json: interface.composerIcon must be ./assets/icon.png");
  }
  if (codex.interface?.shortDescription === "Connect Codex to Mermail.") {
    errors.push(".codex-plugin/plugin.json: shortDescription must not use the Codex default placeholder");
  }
  try {
    await stat(path.join(root, "assets", "icon.png"));
  } catch {
    errors.push("assets/icon.png is required for Codex plugin branding");
  }

  const claude = JSON.parse(await readFile(path.join(root, ".mcp.json"), "utf8"));
  if (claude.mcpServers?.mermail?.headers?.["x-api-key"] !== "${MERMAIL_API_KEY}") {
    errors.push("Claude MCP config must expand MERMAIL_API_KEY in x-api-key");
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
  if (cursor.mcpServers?.mermail?.headers?.["x-api-key"] !== "${env:MERMAIL_API_KEY}") {
    errors.push("Cursor MCP config must expand MERMAIL_API_KEY in x-api-key");
  }
}