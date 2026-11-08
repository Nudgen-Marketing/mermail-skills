import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
function localTargets(markdown, source) {
  return [...markdown.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)]
    .map(m => m[1].split('#')[0])
    .filter(link => link && !/^(?:https?:|mailto:|#|<|\$)/.test(link))
    .map(link => path.resolve(path.dirname(source), decodeURIComponent(link)));
}
test('relative references resolve from the containing document, not the skill root', () => {
  assert.deepEqual(localTargets('[tools](tools.md)', '/repo/skills/example/references/security.md'),
    ['/repo/skills/example/references/tools.md']);
  assert.deepEqual(localTargets('[tools](references/tools.md)', '/repo/skills/example/references/security.md'),
    ['/repo/skills/example/references/references/tools.md']);
  assert.deepEqual(localTargets('[web](https://example.test/x#y) [anchor](#x)', '/repo/a.md'), []);
});
test('every local Markdown reference in installed skills exists', () => {
  const missing = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.name.endsWith('.md')) {
        for (const target of localTargets(fs.readFileSync(file, 'utf8'), file)) {
          if (!fs.existsSync(target)) missing.push({source: path.relative(root, file), target: path.relative(root, target)});
        }
      }
    }
  }
  walk(path.join(root, 'skills'));
  assert.deepEqual(missing, []);
});
