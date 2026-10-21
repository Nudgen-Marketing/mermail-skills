import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { redact, scan, urgency, validateRegexPattern } from "../scripts/scan-repo.mjs";

const execute = promisify(execFile);
const cli = fileURLToPath(new URL("../scripts/scan-repo.mjs", import.meta.url));
const privateKey = "0x" + "ab".repeat(32);

async function fixture(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "deprecation-radar-boundary-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const root = path.join(dir, "repo");
  await mkdir(root);
  await writeFile(path.join(root, "client.js"), `const base = "https://legacy.vendor.example/v1"; const PRIVATE_KEY="${privateKey}";\n`);
  await writeFile(path.join(root, "package.json"), JSON.stringify({ dependencies: { "vendor-sdk": "^1.3.0" } }));
  return { dir, root };
}

test("library preserves literal, escaped-regex, class-regex and package matches without source snippets", async (t) => {
  const { root } = await fixture(t);
  const result = await scan(root, [
    { id: "literal", signals: [{ type: "literal", value: "legacy.vendor.example" }] },
    { id: "regex", signals: [{ type: "regex", value: "legacy\\.vendor\\.example" }] },
    { id: "class", signals: [{ type: "regex", value: "^const [a-z]+" }] },
    { id: "package", signals: [{ type: "package", value: "vendor-sdk", below: "2.0.0" }] },
  ]);
  const by = Object.fromEntries(result.notices.map((notice) => [notice.id, notice]));
  assert.equal(by.literal.hitCount, 1);
  assert.equal(by.regex.hitCount, 1);
  assert.equal(by.class.hitCount, 1);
  assert.equal(by.package.packageFindings[0].affected, true);
  assert.deepEqual({ file: by.literal.hits[0].file, line: by.literal.hits[0].line }, { file: "client.js", line: 1 });
  assert.equal(by.literal.hits[0].snippet_status, "withheld");
  assert.match(by.literal.hits[0].text, /source snippet withheld/);
  assert.ok(!JSON.stringify(result).includes(privateKey));
  assert.ok(!by.literal.hits[0].text.includes("const base"));
});

test("regex policy accepts useful bounded forms and rejects unsafe or unsupported shapes before scanning", async () => {
  for (const pattern of ["legacy\\.vendor\\.example", "https?://legacy.example", "^v[0-9]+$", "^[a-z]{1,12}$", "^.*retired$", "[vV]1"]) {
    assert.equal(validateRegexPattern(pattern), true, pattern);
  }
  for (const pattern of ["(a+)+$", "(a|aa)+$", "a*a*", "a+", "(?=a)a", "\\1", "^a{1000000000}$", "[", "x".repeat(201)]) {
    assert.throws(() => validateRegexPattern(pattern), /regex/, pattern);
  }
  await assert.rejects(scan("/path-that-must-not-be-read", [{ id: "attack", signals: [{ type: "regex", value: "(a+)+$" }] }]), /unsupported regex shape/);
});

test("redaction utility covers reproduced private-key assignment and remains defense in depth", () => {
  assert.ok(!redact(`PRIVATE_KEY="${privateKey}"`).includes(privateKey));
  assert.ok(!redact('apiKey = "jup_abcdefghijklmnopqrstuvwxyz123456"').includes("abcdefghijklmnopqrstuvwxyz"));
  assert.equal(redact("-----BEGIN PRIVATE KEY----- synthetic material -----END PRIVATE KEY-----"), "[REDACTED: private-key material]");
});

test("actual CLI withholds a private key on an ordinary matched source line", async (t) => {
  const { dir, root } = await fixture(t);
  const signals = path.join(dir, "notices.json");
  await writeFile(signals, JSON.stringify({ notices: [{ id: "notice", signals: [{ type: "literal", value: "legacy.vendor.example" }] }] }));
  const result = await execute(process.execPath, [cli, "--signals", signals, "--root", root, "--json"], { timeout: 2000 });
  assert.ok(!result.stdout.includes(privateKey));
  const report = JSON.parse(result.stdout);
  assert.equal(report.notices[0].hitCount, 1);
  assert.equal(report.notices[0].hits[0].file, "client.js");
  assert.equal(report.notices[0].hits[0].snippet_status, "withheld");
});

test("actual CLI rejects the original catastrophic regex input instead of executing it", async (t) => {
  const { dir, root } = await fixture(t);
  await writeFile(path.join(root, "long.txt"), "a".repeat(32) + "!");
  const signals = path.join(dir, "notices.json");
  await writeFile(signals, JSON.stringify({ notices: [{ id: "attack", signals: [{ type: "regex", value: "(a+)+$" }] }] }));
  await assert.rejects(execute(process.execPath, [cli, "--signals", signals, "--root", root, "--json"], { timeout: 2000 }), (error) => {
    assert.equal(error.killed, false);
    assert.equal(error.code, 1);
    assert.match(error.stderr, /unsupported regex shape/);
    assert.equal(error.stdout, "");
    return true;
  });
});

test("dependency evidence withholds arbitrary source specifiers and does not guess crossing version ranges", async (t) => {
  const { root } = await fixture(t);
  const sourceSecret = "SYNTHETIC_DEPENDENCY_PASSWORD";
  await writeFile(path.join(root, "package.json"), JSON.stringify({ dependencies: {
    "remote-sdk": `git+https://demo:${sourceSecret}@example.test/sdk.git`,
    "crossing-sdk": "^1.3.0", "exact-sdk": "1.3.0", "new-sdk": "2.1.0",
  } }));
  const result = await scan(root, [{ id: "packages", signals: [
    { type: "package", value: "remote-sdk", below: "2.0.0" },
    { type: "package", value: "crossing-sdk", below: "1.4.0" },
    { type: "package", value: "exact-sdk", below: "2.0.0" },
    { type: "package", value: "new-sdk", below: "2.0.0" },
  ] }]);
  const by = Object.fromEntries(result.notices[0].packageFindings.map(row => [row.package, row]));
  assert.ok(!JSON.stringify(result).includes(sourceSecret));
  assert.equal(by["remote-sdk"].affected, null);
  assert.equal(by["crossing-sdk"].affected, null);
  assert.equal(by["exact-sdk"].affected, true);
  assert.equal(by["new-sdk"].affected, false);
});

test("invalid calendar dates and scan limits fail closed without guessed urgency or unbounded hits", async () => {
  for (const date of ["2026-02-30", "2026-02-29", "2026-04-31", "not-a-date"]) assert.equal(urgency(date), "unknown-date");
  assert.equal(urgency("2028-02-29", new Date("2028-02-28T00:00:00Z")), "due-within-14-days");
  for (const limit of [NaN, Infinity, -1, 0, 1.5, 10001]) await assert.rejects(scan("/must-not-read", [], limit), /max-hits/);
});

test("actual capped CLI does not describe another notice's missing hits as repository-wide absence", async (t) => {
  const { dir, root } = await fixture(t);
  const signals = path.join(dir, "capped.json");
  await writeFile(signals, JSON.stringify({ notices: [
    { id: "first", signals: [{ type: "literal", value: "legacy.vendor.example" }] },
    { id: "second", signals: [{ type: "literal", value: "legacy.vendor.example" }] },
  ] }));
  const result = await execute(process.execPath, [cli, "--signals", signals, "--root", root, "--max-hits", "1"], { timeout: 2000 });
  assert.match(result.stdout, /absence not established/);
  assert.ok(!result.stdout.includes("no references found in this repository"));
});
