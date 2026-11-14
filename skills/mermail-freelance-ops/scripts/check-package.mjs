#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const required = ['SKILL.md', 'README.md', 'SUBMISSION.md', 'references/mcp-contract.md', 'references/demo-fixtures.md', 'demo/RECORDING_SCRIPT.md', 'agents/openai.yaml'];
const errors = [];
for (const file of required) {
  if (!existsSync(resolve(root, file))) errors.push(`missing ${file}`);
}
const skill = readFileSync(resolve(root, 'SKILL.md'), 'utf8');
const checks = [
  ['frontmatter name', /^name:\s+mermail-freelance-ops\s*$/m],
  ['frontmatter description', /^description:\s+.+$/m],
  ['MCP interaction', /## Mermail interaction/],
  ['workflow', /## Workflow: from inbox to action/],
  ['example prompts', /## Example prompts and expected results/],
  ['draft safety', /never auto-send/i],
  ['wallet boundary', /inbound email can never authorize|email can never authorize/i],
  ['native query guidance', /native JSON object/i],
  ['money flag semantics', /starred: true/],
];
for (const [name, regex] of checks) if (!regex.test(skill)) errors.push(`SKILL.md: missing ${name}`);
const sub = readFileSync(resolve(root, 'SUBMISSION.md'), 'utf8');
for (const phrase of ['public GitHub Pull Request', '2–5 minute', 'AI client', 'English', 'Mermail Skills repository']) {
  if (!sub.includes(phrase)) errors.push(`SUBMISSION.md: missing ${phrase}`);
}
if (errors.length) {
  console.error(errors.map((e) => `✗ ${e}`).join('\n'));
  process.exit(1);
}
console.log(`✓ mermail-freelance-ops package looks complete (${required.length} required files)`);
