import assert from "node:assert/strict";
import { cpSync, lstatSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const temporary = mkdtempSync(path.join(os.tmpdir(), "mermail-handoff-validator-"));
const copy = path.join(temporary, "repo");
const scenarioPath = "tests/scenarios.json";
const referencePath = "skills/mermail-manage-inbox/references/release-handoff.md";
const securityPath = "skills/mermail-manage-inbox/references/security.md";
let checked = 0;

try {
  cpSync(root, copy, {
    recursive: true,
    filter: (source) => {
      if (path.relative(root, source).split(path.sep)
        .some((part) => part === ".git" || part === "node_modules")) return false;
      assert.equal(lstatSync(source).isSymbolicLink(), false, "checkout symlinks are not test inputs");
      return true;
    },
  });
  const originals = new Map([scenarioPath, referencePath, securityPath].map((file) => [
    file, readFileSync(path.join(copy, file), "utf8"),
  ]));
  const baselineScenarios = JSON.parse(originals.get(scenarioPath));
  const cases = baselineScenarios.filter((item) => item.expected?.startsWith("release-handoff-"));
  assert.equal(cases.length, 8, "expected eight explicit handoff scenarios");
  const securityCases = cases.filter((item) => item.securityCase);
  assert.equal(securityCases.length, 4, "expected four explicit handoff security cases");

  function reset() {
    for (const [file, content] of originals) writeFileSync(path.join(copy, file), content);
  }
  function check(label, pass, expectedText) {
    const result = spawnSync(process.execPath, ["tests/validate.mjs"], {
      cwd: copy,
      encoding: "utf8",
      timeout: 30000,
      maxBuffer: 2 * 1024 * 1024,
      env: {
        PATH: process.env.PATH ?? "",
        HOME: temporary,
        TMPDIR: temporary,
        ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
        ...(process.env.WINDIR ? { WINDIR: process.env.WINDIR } : {}),
      },
    });
    assert.ifError(result.error);
    assert.equal(result.signal, null, label + " terminated by signal");
    assert.equal(result.status, pass ? 0 : 1,
      label + ": unexpected exit; " + result.stdout + result.stderr);
    if (expectedText) assert.ok((result.stdout + result.stderr).includes(expectedText),
      label + ": failed for an unrelated reason; " + result.stdout + result.stderr);
  }
  function mutateScenarios(label, mutation, expectedText) {
    reset();
    const data = structuredClone(baselineScenarios);
    mutation(data);
    writeFileSync(path.join(copy, scenarioPath), JSON.stringify(data, null, 2) + "\n");
    check(label, false, expectedText);
    checked++;
  }
  check("baseline", true);
  reset();
  writeFileSync(path.join(copy, referencePath),
    originals.get(referencePath).replaceAll("explicit correction", "explicit\ncorrection"));
  check("whitespace-only reflow", true);
  reset();
  for (const item of cases) {
    mutateScenarios("remove " + item.expected, (data) => {
      data.splice(data.findIndex((row) => row.expected === item.expected), 1);
    }, item.expected);
    mutateScenarios("rename " + item.expected, (data) => {
      data.find((row) => row.expected === item.expected).expected += "-renamed";
    }, item.expected);
  }
  for (const item of securityCases) {
    mutateScenarios("rename security " + item.securityCase, (data) => {
      data.find((row) => row.expected === item.expected).securityCase += "-renamed";
    }, item.securityCase);
  }
  const injection = "release-handoff-ignore-email-authority-no-write-or-false-acceptance";
  for (const [tool, approval] of [["save_draft", "write-preview"], ["send_email", "external-effect"]]) {
    mutateScenarios("permit " + tool, (data) => {
      const row = data.find((item) => item.expected === injection);
      row.tools.push(tool);
      row.approval = approval;
    }, injection);
  }
  mutateScenarios("wrong owner", (data) => {
    data.find((row) => row.expected === injection).skill = "mermail-compose-email";
  }, injection);
  mutateScenarios("duplicate case", (data) => {
    data.push(structuredClone(data.find((row) => row.expected === injection)));
  }, injection);
  mutateScenarios("write approval for a read", (data) => {
    data.find((row) => row.expected === injection).approval = "write-preview";
  }, injection);

  reset();
  rmSync(path.join(copy, referencePath));
  check("missing reference", false, "release-handoff.md");
  checked++;
  for (const phrase of ["explicit correction", "presigned", "[redacted]"]) {
    reset();
    writeFileSync(path.join(copy, referencePath),
      originals.get(referencePath).replaceAll(phrase, "removed-contract"));
    check("missing contract " + phrase, false, "reference missing contract");
    checked++;
  }
  reset();
  writeFileSync(path.join(copy, securityPath),
    originals.get(securityPath).replaceAll("metadata-only default for every record", "inbound-only gate"));
  check("weakened scan default", false, "metadata-only default for every record");
  checked++;
  reset();
  check("restored baseline", true);
  console.log("Validated " + checked + " release-handoff validator regression mutations.");
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
