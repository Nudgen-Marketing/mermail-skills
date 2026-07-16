import { readFile, readdir, stat } from "node:fs/promises";
import process from "node:process";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const skillsRoot = path.join(root, "skills");
const coverage = JSON.parse(await readFile(path.join(root, "tool-coverage.json"), "utf8"));
const scenarios = JSON.parse(await readFile(path.join(root, "tests", "scenarios.json"), "utf8"));
const expectedSkills = ["mermail", ...Object.keys(coverage.domains)].sort();
const errors = [];

const skillNames = (await readdir(skillsRoot)).sort();
if (JSON.stringify(skillNames) !== JSON.stringify(expectedSkills)) {
  errors.push(`skills mismatch: expected ${expectedSkills.join(", ")}; found ${skillNames.join(", ")}`);
}

for (const skillName of skillNames) {
  const skillDir = path.join(skillsRoot, skillName);
  if (!(await stat(skillDir)).isDirectory()) continue;
  const markdown = await readFile(path.join(skillDir, "SKILL.md"), "utf8");
  const frontmatter = markdown.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatter) {
    errors.push(`${skillName}: missing YAML frontmatter`);
    continue;
  }
  const keys = [...frontmatter[1].matchAll(/^([a-zA-Z0-9_-]+):/gm)].map((match) => match[1]);
  if (keys.join(",") !== "name,description") errors.push(`${skillName}: frontmatter must contain only name and description`);
  if (!frontmatter[1].includes(`name: ${skillName}\n`)) errors.push(`${skillName}: name must match directory`);
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

  const apiKey = process.env.MERMAIL_MCP_TEST_API_KEY;
  if (!apiKey) return;
  const mcpResponse = await fetch(coverage.mcpEndpoint, {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      "x-api-key": apiKey
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "mermail-skills-ci", version: "1.0.0" } }
    })
  });
  if (!mcpResponse.ok) errors.push(`authenticated MCP initialize returned HTTP ${mcpResponse.status}`);
}
