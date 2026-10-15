import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../.github/workflows/clawhub-skill-publish.yml', import.meta.url), 'utf8');
const condition = source.match(/^  publish:\n[\s\S]*?^    if: (.+)$/m)?.[1];
assert.ok(condition, 'publish job must have an explicit gate');
const upstream = 'Nudgen-Marketing/mermail-skills';

for (const repository of [upstream, 'aminuabkrr/mermail-skills']) {
  for (const event of ['push', 'pull_request', 'workflow_dispatch']) {
    test(`${repository} ${event}: publication gate`, () => {
      const enabled = vm.runInNewContext(condition, {
        github: { repository, event_name: event, ref: 'refs/heads/main' },
      }, { timeout: 100 });
      assert.equal(enabled, repository === upstream && event !== 'pull_request');
    });
  }
}

test('PR dry run stays enabled without repository restriction', () => {
  const dryRunCondition = source.match(/^  dry-run:\n[\s\S]*?^    if: (.+)$/m)?.[1];
  assert.ok(dryRunCondition);
  assert.equal(vm.runInNewContext(dryRunCondition, {
    github: { repository: 'aminuabkrr/mermail-skills', event_name: 'pull_request' },
  }), true);
});
