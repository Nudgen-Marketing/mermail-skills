import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../.github/workflows/clawhub-package-publish.yml', import.meta.url), 'utf8');
const pin = 'ff6c118c132ae89b5351739cc45fe9227ff1574e';
// Read the flat job blocks used in this workflow; fail if their shape changes.
function job(id) {
  const block = source.match(new RegExp(`^  ${id}:\\n([\\s\\S]*?)(?=^  [a-z][a-z-]*:|$(?![\\s\\S]))`, 'm'))?.[1];
  assert.ok(block, `Missing job ${id}`);
  return block;
}
function enabled(id, event, head = 'contributor/fork', published = 'false') {
  const condition = job(id).match(/^    if: (.+)$/m)?.[1];
  assert.ok(condition, `Missing condition for ${id}`);
  return vm.runInNewContext(condition, {
    github: {
      event_name: event,
      repository: 'Nudgen-Marketing/mermail-skills',
      ref: event === 'push' ? 'refs/tags/v1.5.7' : 'refs/heads/main',
      event: event === 'pull_request' ? { pull_request: { head: { repo: { full_name: head } } } } : {},
    },
    needs: { validate: { outputs: { already_published: published } } },
    startsWith: (value, prefix) => value.startsWith(prefix),
  }, { timeout: 100 });
}

test('fork PR takes exactly the non-publishing route', () => {
  assert.equal(enabled('fork-dry-run', 'pull_request'), true);
  assert.equal(enabled('dry-run', 'pull_request'), false);
  assert.equal(enabled('publish', 'pull_request'), false);
});
test('same-repository PR retains the original reusable dry-run', () => {
  assert.equal(enabled('fork-dry-run', 'pull_request', 'Nudgen-Marketing/mermail-skills'), false);
  assert.equal(enabled('dry-run', 'pull_request', 'Nudgen-Marketing/mermail-skills'), true);
  assert.equal(enabled('publish', 'pull_request', 'Nudgen-Marketing/mermail-skills'), false);
});
test('tag and manual release paths are unchanged and never enter fork jobs', () => {
  for (const event of ['push', 'workflow_dispatch']) {
    assert.equal(enabled('fork-dry-run', event), false);
    assert.equal(enabled('dry-run', event), false);
    assert.equal(enabled('publish', event), true);
    assert.equal(enabled('publish', event, '', 'true'), false);
  }
});
test('fork execution is pinned, read-only and explicitly dry-run', () => {
  const fork = job('fork-dry-run');
  assert.match(fork, /permissions:\n      contents: read\n/);
  assert.doesNotMatch(fork, /id-token:|secrets\.|pull_request_target|GH_TOKEN|CLAWHUB_TOKEN/);
  assert.match(fork, new RegExp(`ref: ${pin}`));
  assert.match(fork, /bun-version: 1\.3\.10/);
  assert.match(fork, /bun install --frozen-lockfile/);
  assert.match(fork, /package validate .*--out/);
  const writes = fork.split('\n').filter(line => line.includes('package publish '));
  assert.equal(writes.length, 1);
  assert.match(writes[0], /--dry-run --json/);
  assert.match(writes[0], /--family bundle-plugin/);
  assert.match(fork, /path: contribution/);
  assert.match(fork, /path: clawhub-source/);
  assert.equal((fork.match(/persist-credentials: false/g) || []).length, 2);
  assert.doesNotMatch(fork, /continue-on-error/);
  assert.match(job('dry-run'), new RegExp(`package-publish.yml@${pin}`));
  assert.match(job('publish'), new RegExp(`package-publish.yml@${pin}`));
});
