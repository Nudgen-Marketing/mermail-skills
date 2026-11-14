// Offline documentation/identity consistency only. Does not load client configs,
// import provider helpers, start MCP servers or simulate model behavior.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const copies = [".agents/skills/mermail-skills/SKILL.md", ".claude/skills/mermail-skills/SKILL.md"];
const read = relative => readFile(path.join(root, relative), "utf8");
const nameOf = text => text.match(/^---\r?\n[\s\S]*?^name: ([a-z0-9-]+)\s*$/m)?.[1];

test("both client-discoverable convention copies agree and identify their actual directories", async () => {
  const texts = await Promise.all(copies.map(read));
  assert.ok(texts[0] === texts[1], "client copies must not prescribe different conventions");
  for (let i = 0; i < copies.length; i++) {
    assert.equal(nameOf(texts[i]), path.basename(path.dirname(copies[i])));
    assert.match(nameOf(texts[i]), /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  }
  const metadata = await read(".agents/skills/mermail-skills/agents/openai.yaml");
  const prompt = metadata.match(/^  default_prompt: "([^"]+)"$/m)?.[1];
  assert.ok(prompt?.includes(`$${nameOf(texts[0])}`), "UI invocation must resolve the actual skill identity");
  assert.match(metadata, /^  allow_implicit_invocation: true\s*$/m, "preserve existing invocation policy");
});

test("all linked authoring and helper examples resolve inside the repository for either host", async () => {
  for (const relative of copies) {
    const text = await read(relative);
    const links = [...text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map(match => match[1]);
    assert.ok(links.length >= 7, "maintained authoring/helper references must remain discoverable");
    for (const link of links) {
      assert.ok(!/^[a-z]+:/i.test(link), "repo development examples should resolve locally without a network fetch");
      const resolved = path.resolve(root, path.dirname(relative), link.split("#")[0]);
      assert.ok(resolved.startsWith(`${root}${path.sep}`));
      assert.ok((await stat(resolved)).isFile(), `${relative}: ${link} must exist`);
    }
  }
  // The illustrated import is a real dependency, not a fabricated UI example.
  const validator = await read("tests/validate.mjs");
  const implementation = await read("tests/research-agent.mjs");
  assert.match(validator, /import \{ validateResearchAgent \} from "\.\/research-agent\.mjs"/);
  assert.match(implementation, /export async function validateResearchAgent\(/);
});

test("generated language suggestions correspond to actual source files, not an assumed UI stack", async () => {
  const identity = JSON.parse(await read(".claude/identity.json"));
  const extensions = new Set();
  const visit = async directory => {
    for (const entry of await readdir(path.join(root, directory), { withFileTypes: true })) {
      const relative = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(relative);
      else if (entry.isFile()) extensions.add(path.extname(entry.name));
    }
  };
  for (const directory of ["skills", "scripts", "tests"]) await visit(directory);
  const requiredSource = { markdown: [".md"], javascript: [".js", ".mjs"], python: [".py"], typescript: [".ts", ".tsx"] };
  for (const domain of identity.domains) {
    assert.ok(requiredSource[domain]?.some(extension => extensions.has(extension)), `suggested language ${domain} has no source evidence`);
  }
  assert.ok(identity.domains.includes("markdown"), "primary skill resource format must be represented");
});

test("generated managed inventory still points at real files without activating any adapters", async () => {
  const inventory = JSON.parse(await read(".claude/ecc-tools.json"));
  for (const relative of inventory.managedFiles) {
    assert.ok(!path.isAbsolute(relative) && !relative.split(/[\\/]/).includes(".."));
    assert.ok((await stat(path.join(root, relative))).isFile(), relative);
  }
});
