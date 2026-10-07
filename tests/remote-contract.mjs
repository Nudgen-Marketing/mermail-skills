import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const coverage = JSON.parse(readFileSync(path.join(root, "tool-coverage.json"), "utf8"));
const catalog = [coverage.confirmationTool, ...Object.values(coverage.domains).flat()];
const success = "Authenticated Mermail proof passed:";

// Run the actual validator with a hermetic transport. Never call Mermail or use a real key.
function validate({ names = catalog, discovery = catalog, unauthenticatedStatus = 401, key = true, mode = "valid" } = {}) {
  const setup = `
    const coverage = ${JSON.stringify(coverage)};
    const names = ${JSON.stringify(names)};
    const discovery = ${JSON.stringify(discovery)};
    const mode = ${JSON.stringify(mode)};
    const rpc = (request, result) => Response.json({jsonrpc: mode === "invalid-envelope" ? "0.0" : "2.0", id: mode === "invalid-envelope" ? 999 : request.id, result});
    globalThis.fetch = async (url, options = {}) => {
      if (options.redirect !== "error" || !(options.signal instanceof AbortSignal)) throw new Error("Missing transport boundary");
      if (url === coverage.discoveryEndpoint) {
        return Response.json({ capabilities: { tools: { list: discovery } } });
      }
      if (url !== coverage.mcpEndpoint) throw new Error("Unexpected network target in offline test");
      if (!options.headers?.["x-api-key"]) return new Response(null, { status: ${unauthenticatedStatus} });
      const request = JSON.parse(options.body);
      if (mode === "reflected-network-error") throw new Error(process.env.MERMAIL_MCP_TEST_API_KEY);
      if (mode === "reflected-json-error") return {ok:true,json:async()=>{throw new Error(process.env.MERMAIL_MCP_TEST_API_KEY);}};
      if (request.method === "initialize") return rpc(request, { serverInfo: { name: "offline-fixture" } });
      if (request.method === "tools/list") return rpc(request, { tools: names.map(name => ({ name })) });
      if (request.method === "tools/call" && ["list_workspaces", "list_mailboxes"].includes(request.params.name)) {
        return rpc(request, { structuredContent: { items: [] } });
      }
      throw new Error("Unexpected MCP operation in read-only validation test");
    };
  `;
  const result = spawnSync(process.execPath, [
    "--import", `data:text/javascript,${encodeURIComponent(setup)}`,
    "tests/validate.mjs", "--remote",
  ], {
    cwd: root,
    encoding: "utf8",
    timeout: 30_000,
    env: { ...process.env, MERMAIL_MCP_TEST_API_KEY: key ? "offline-test-only" : "", MERMAIL_REQUIRE_TEST_API_KEY: "1" },
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  return result;
}

test("remote proof reports the actual complete catalog, independent of order", () => {
  const result = validate({ names: [...catalog].reverse() });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes(`${success} initialize; ${catalog.length}-tool catalog;`));
});

test("remote proof rejects a substituted tool even when the count is unchanged", () => {
  const result = validate({ names: [coverage.confirmationTool, "unexpected_fixture_tool", ...catalog.slice(2)] });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /authenticated tools\/list differs from tool-coverage\.json/);
  assert.match(result.stderr, /uncovered: unexpected_fixture_tool; absent on server: /);
  assert.ok(!result.stdout.includes(success));
});

test("remote proof rejects a truncated authenticated catalog", () => {
  const result = validate({ names: catalog.slice(1) });
  assert.equal(result.status, 1);
  assert.ok(result.stderr.includes(`expected ${catalog.length}`));
  assert.ok(!result.stdout.includes(success));
});

test("remote proof never reports success after a discovery mismatch", () => {
  const result = validate({ discovery: [...catalog.slice(1), "new_public_webhook_tool"] });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /production MCP tool catalog differs.*uncovered: new_public_webhook_tool; absent on server: prepare_destructive_action/);
  assert.ok(!result.stdout.includes(success));
});

test("remote proof never reports success when anonymous access is accepted", () => {
  const result = validate({ unauthenticatedStatus: 200 });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /expected 401/);
  assert.ok(!result.stdout.includes(success));
});

test("manual remote proof still requires the configured test credential", () => {
  const result = validate({ key: false });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /requires MERMAIL_MCP_TEST_API_KEY/);
  assert.ok(!result.stdout.includes(success));
});

test("remote diagnostic rejects reflected credential in a tool name without logging it", () => {
  const dummy = "offline-test-only";
  const result = validate({ names: [catalog[0], dummy, ...catalog.slice(2)] });
  assert.equal(result.status, 1);
  assert.ok(!(result.stdout + result.stderr).includes(dummy));
  assert.match(result.stderr, /redacted-or-invalid/);
});

for (const mode of ["invalid-envelope", "reflected-network-error", "reflected-json-error"]) {
  test(`remote proof rejects ${mode} without logging a credential or false success`, () => {
    const result = validate({ mode });
    assert.equal(result.status, 1);
    assert.ok(!(result.stdout + result.stderr).includes("offline-test-only"));
    assert.ok(!result.stdout.includes(success));
  });
}
