import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Offline reference-contract checks, NOT model behavior or live MCP E2E.
// Audited against product app/server/mcp/{catalog,server,webhook-schema}.ts,
// confirmation.ts and app/server/webhooks/{routes,service}.ts on 2026-10-21.
// This deliberately small local contract checks the documented native examples;
// it is not a replacement for the production schemas or authorization service.
const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const coverage = JSON.parse(read('tool-coverage.json'));
const scenarios = JSON.parse(read('tests/scenarios.json'));
const reference = read('skills/mermail-webhook-reactor/references/tools.md');
const calls = [...reference.matchAll(/```json\n([\s\S]*?)\n```/g)].map(match => JSON.parse(match[1]));
const mutations = ['create_webhook', 'update_webhook', 'delete_webhook', 'test_webhook', 'retry_webhook_delivery', 'rotate_webhook_secret'];
const reads = ['list_webhooks', 'get_webhook', 'list_webhook_deliveries'];
const keyed = new Set(['create_webhook', 'test_webhook', 'retry_webhook_delivery']);
const eventTypes = new Set(['message.received', 'message.sent', 'message.delivered', 'message.delivery_delayed', 'message.bounced', 'message.complained']);
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
const identifier = value => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 500;

function validateSettings(body, create) {
  assert.ok(plain(body), 'native body object');
  const allowed = ['url', 'eventTypes', 'allInboxes', 'mailboxIds', 'authorization', ...(create ? [] : ['status'])];
  assert.ok(Object.keys(body).length > 0, 'nonempty settings');
  for (const field of Object.keys(body)) assert.ok(allowed.includes(field), `unsupported settings field ${field}`);
  if (create) for (const field of ['url', 'eventTypes', 'allInboxes', 'mailboxIds']) assert.ok(Object.hasOwn(body, field), `required ${field}`);
  if (Object.hasOwn(body, 'url')) {
    assert.equal(typeof body.url, 'string'); assert.ok(body.url.length <= 4096);
    const url = new URL(body.url);
    assert.equal(url.protocol, 'https:'); assert.equal(url.username, ''); assert.equal(url.password, ''); assert.equal(url.hash, '');
  }
  if (Object.hasOwn(body, 'eventTypes')) {
    assert.ok(Array.isArray(body.eventTypes) && body.eventTypes.length >= 1 && body.eventTypes.length <= 6);
    assert.ok(body.eventTypes.every(value => eventTypes.has(value)));
  }
  if (Object.hasOwn(body, 'allInboxes')) assert.equal(typeof body.allInboxes, 'boolean');
  if (Object.hasOwn(body, 'mailboxIds')) assert.ok(Array.isArray(body.mailboxIds) && body.mailboxIds.length <= 500 && body.mailboxIds.every(value => typeof value === 'string' && value.length >= 1 && value.length <= 320));
  if (Object.hasOwn(body, 'allInboxes') && Object.hasOwn(body, 'mailboxIds')) assert.equal(body.mailboxIds.length === 0, body.allInboxes);
  if (Object.hasOwn(body, 'authorization')) assert.ok(body.authorization === null || (typeof body.authorization === 'string' && /^[\x20-\x7e]{1,4096}$/.test(body.authorization)));
  if (Object.hasOwn(body, 'status')) assert.ok(['active', 'paused'].includes(body.status));
}

function validateMutation(call, prepared = false) {
  assert.ok(mutations.includes(call.name)); assert.ok(plain(call.arguments));
  const args = call.arguments;
  assert.ok(identifier(args.workspaceId));
  if (call.name !== 'create_webhook') assert.ok(identifier(args.webhookId));
  if (call.name === 'retry_webhook_delivery') assert.ok(identifier(args.deliveryId));
  if (keyed.has(call.name)) assert.match(args.idempotencyKey ?? '', /^[A-Za-z0-9._:-]{1,128}$/);
  if (!prepared) assert.match(args.confirmationToken ?? '', /^mcp_confirm_/);
  else assert.equal(Object.hasOwn(args, 'confirmationToken'), false);
  const fields = ['workspaceId', ...(call.name === 'create_webhook' ? [] : ['webhookId']),
    ...(call.name === 'retry_webhook_delivery' ? ['deliveryId'] : []),
    ...(keyed.has(call.name) ? ['idempotencyKey'] : []), ...(prepared ? [] : ['confirmationToken']),
    ...(['create_webhook', 'update_webhook'].includes(call.name) ? ['body'] : [])];
  // These examples intentionally use no optional generic body/query arguments;
  // tests reject invented endpoint/payload overrides, not all server schema options.
  for (const field of Object.keys(args)) assert.ok(fields.includes(field), `unexpected example argument ${field}`);
  if (['create_webhook', 'update_webhook'].includes(call.name)) validateSettings(args.body, call.name === 'create_webhook');
}

test('all nine webhook tools retain the admin as their sole owner; all six effects remain destructive', () => {
  for (const name of [...reads, ...mutations]) {
    const owners = Object.entries(coverage.domains).filter(([, names]) => names.includes(name));
    assert.deepEqual(owners.map(([owner]) => owner), ['mermail-administer-workspace']);
    assert.equal(Object.values(coverage.domains).flat().filter(value => value === name).length, 1);
    assert.equal(coverage.destructiveTools.includes(name), mutations.includes(name));
  }
  assert.equal(new Set(coverage.destructiveTools).size, coverage.destructiveTools.length);
  assert.equal(Object.hasOwn(coverage.domains, 'mermail-webhook-reactor'), false);
});

test('each documented mutation uses native scoped arguments and a top-level confirmation token', () => {
  const examples = calls.filter(call => mutations.includes(call.name));
  assert.deepEqual(examples.map(call => call.name).sort(), [...mutations].sort());
  for (const call of examples) validateMutation(call);
});

test('documented preparation exactly matches final create arguments excluding only the returned token', () => {
  const prepare = calls.find(call => call.name === 'prepare_destructive_action');
  assert.ok(prepare); assert.deepEqual(Object.keys(prepare.arguments).sort(), ['action', 'arguments']);
  const execute = calls.find(call => call.name === prepare.arguments.action);
  const { confirmationToken, ...finalArgs } = execute.arguments;
  assert.ok(confirmationToken);
  assert.deepEqual(prepare.arguments.arguments, finalArgs);
  validateMutation({ name: prepare.arguments.action, arguments: prepare.arguments.arguments }, true);
});

test('missing scope, wrong key/token placement and invented webhook fields fail reference checks', () => {
  const base = calls.find(call => call.name === 'create_webhook');
  for (const change of [
    args => delete args.workspaceId,
    args => delete args.idempotencyKey,
    args => { args.idempotencyKey = 'not a key'; },
    args => { args.body.confirmationToken = args.confirmationToken; delete args.confirmationToken; },
    args => { args.mailboxId = args.body.mailboxIds[0]; },
    args => { args.body.events = args.body.eventTypes; delete args.body.eventTypes; },
    args => { args.body.endpoint = args.body.url; delete args.body.url; },
    args => { args.body.enabled = true; },
    args => { args.body = JSON.stringify(args.body); },
    args => { args.body.allInboxes = true; },
    args => { args.body.eventTypes = ['email.received']; },
    args => { args.body.url = 'https://ops.example.com/hook#fragment'; },
    args => { args.body.url = 'https://user:password@ops.example.com/hook'; },
    args => { args.body.url = 'http://ops.example.com/hook'; },
  ]) {
    const changed = structuredClone(base); change(changed.arguments);
    assert.throws(() => validateMutation(changed));
  }
  const testCall = structuredClone(calls.find(call => call.name === 'test_webhook'));
  testCall.arguments.body = { url: 'https://other.example.com/hook' };
  assert.throws(() => validateMutation(testCall));
});

test('declarative mutation scenarios preserve confirmation and unknown-outcome expectations', () => {
  // Membership/assertions only: these records have not been run by a model.
  const own = scenarios.filter(row => row.skill === 'mermail-webhook-reactor');
  for (const row of own) if (row.tools.some(name => mutations.includes(name))) assert.equal(row.approval, 'destructive');
  // The shared scenario tools array enumerates business tools only; the
  // confirmation tool is represented explicitly, not added to business ownership.
  for (const name of mutations) assert.ok(own.some(row => row.confirmationTool === coverage.confirmationTool && row.tools.includes(name) && row.expected === `webhook-bound-${name}`));
  for (const expected of ['webhook-unknown-create-reconcile-no-new-key-or-subscription', 'webhook-unknown-test-retry-read-original-delivery-no-replay', 'webhook-rotation-secret-not-recoverable-from-read', 'route-standalone-webhook-admin-not-new-owner']) assert.ok(scenarios.some(row => row.expected === expected), expected);
});
