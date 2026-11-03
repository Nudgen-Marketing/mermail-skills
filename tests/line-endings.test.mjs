import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

const root = path.resolve(import.meta.dirname, "..");

for (const [label, newline] of [["LF", "\n"], ["CRLF", "\r\n"]]) {
  test(`validates ${label} skills without bypassing frontmatter checks`, async () => {
    const fixture = await mkdtemp(path.join(tmpdir(), "mermail-line-endings-"));
    try {
      await cp(root, fixture, {
        recursive: true,
        filter: (source) => ![".git", "node_modules"].includes(path.relative(root, source).split(path.sep)[0]),
      });
      const skills = path.join(fixture, "skills");
      for (const entry of await readdir(skills, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const file = path.join(skills, entry.name, "SKILL.md");
        const content = (await readFile(file, "utf8")).replace(/\r\n/g, "\n");
        await writeFile(file, content.replace(/\n/g, newline));
      }

      const validate = () => {
        const result = spawnSync(process.execPath, ["tests/validate.mjs"], {
          cwd: fixture, encoding: "utf8", timeout: 30_000, windowsHide: true,
        });
        assert.ifError(result.error);
        return result;
      };
      const valid = validate();
      assert.equal(valid.status, 0, valid.stdout + valid.stderr);

      const target = path.join(skills, "mermail", "SKILL.md");
      const original = await readFile(target, "utf8");
      for (const [content, error] of [
        [original.replace(`---${newline}`, ""), "missing YAML frontmatter"],
        [original.replace(`name: mermail${newline}`, `name: wrong-name${newline}`), "name must match directory"],
        [original.replace(`metadata:${newline}  openclaw:`, `metadata:${newline}  different:`), "missing metadata.openclaw"],
        [original.replace(`---${newline}`, `---${newline}unsupported: value${newline}`), "unexpected frontmatter key unsupported"],
      ]) {
        await writeFile(target, content);
        const invalid = validate();
        assert.equal(invalid.status, 1, invalid.stdout + invalid.stderr);
        assert.ok(invalid.stderr.includes(`mermail: ${error}`), invalid.stderr);
      }
    } finally {
      // Only remove the unique temporary fixture created by this test.
      assert.equal(path.dirname(fixture), path.resolve(tmpdir()));
      assert.ok(path.basename(fixture).startsWith("mermail-line-endings-"));
      await rm(fixture, { recursive: true, force: true });
    }
  });
}
