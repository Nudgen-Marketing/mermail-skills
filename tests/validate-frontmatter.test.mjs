import assert from "node:assert/strict";
import test from "node:test";

import { parseFrontmatter } from "./frontmatter.mjs";

test("frontmatter parser accepts LF and CRLF equivalents", () => {
  const lf = "---\nname: example\ndescription: test\n---\nBody\n";
  const crlf = lf.replace(/\n/gu, "\r\n");
  const mixed = "---\r\nname: example\ndescription: test\r\n---\nBody\n";
  assert.equal(parseFrontmatter(lf)?.[1], "name: example\ndescription: test");
  assert.equal(parseFrontmatter(crlf)?.[1], "name: example\ndescription: test");
  assert.equal(parseFrontmatter(mixed)?.[1], "name: example\ndescription: test");
});

test("frontmatter parser rejects missing and malformed frontmatter", () => {
  assert.equal(parseFrontmatter("name: example\ndescription: test\n"), null);
  assert.equal(parseFrontmatter("---\nname: example\ndescription: test\nBody\n"), null);
});
