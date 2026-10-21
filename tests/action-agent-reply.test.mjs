// Offline contract/reference regressions, not execution of a model or mail service.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const scenarios = JSON.parse(await readFile(new URL("tests/scenarios.json", root), "utf8"));
const cases = scenarios.filter(row => row.skill === "mermail-action-agent");
const tools = await readFile(new URL("skills/mermail-action-agent/references/tools.md", root), "utf8");
const example = JSON.parse([...tools.matchAll(/```json\n([\s\S]*?)\n```/g)][0][1]);
const approved = cases.find(row => row.actionAgentCase === "approved-reply");

// Validate the actual documented native request against the selected-source
// invariant. This prevents the former thread_id-only example from passing as a
// reply contract. It does not simulate provider threading or agent adherence.
function validateReplyArguments(args, source) {
  assert.equal(typeof args, "object");
  assert.equal(args.mailboxId, source.mailboxId);
  assert.equal(args.emailId, source.emailId);
  assert.notEqual(args.emailId, args.body?.source_draft_id);
  assert.equal(typeof args.body, "object");
  assert.equal(typeof args.body.from, "string");
  assert.ok(args.body.to);
  assert.equal(typeof args.body.subject, "string");
  assert.ok(typeof args.body.text === "string" || typeof args.body.html === "string");
  assert.equal(Object.hasOwn(args.body, "body"), false);
}

test("documented reply arguments bind the actual selected source, not draft or thread", () => {
  validateReplyArguments(example, approved.replyPreview);
  assert.equal(typeof example.idempotencyKey, "string");
  assert.notEqual(example.emailId, example.body.source_draft_id);
  const { idempotencyKey, ...payload } = example;
  assert.deepEqual(payload, approved.replyPreview);
  assert.ok(approved.tools.includes("reply_to_email"));
  assert.ok(!approved.tools.includes("send_email"));
  assert.equal(approved.approval, "external-effect");
});

test("former thread-only send, wrong source, draft-as-source and stringified body fail reference invariant", () => {
  const prior = {
    mailboxId: example.mailboxId,
    body: { ...example.body, thread_id: "conversation-thread-id" },
  };
  for (const invalid of [
    prior,
    { ...example, emailId: "another-source-email" },
    { ...example, emailId: example.body.source_draft_id },
    { ...example, body: JSON.stringify(example.body) },
  ]) assert.throws(() => validateReplyArguments(invalid, approved.replyPreview));
});

test("draft-only reference creates an unsent draft and contains no delivery tool", () => {
  const draft = cases.find(row => row.actionAgentCase === "draft-only");
  assert.ok(draft.tools.includes("save_draft"));
  assert.equal(draft.approval, "none");
  for (const tool of ["send_email", "reply_to_email", "forward_email", "schedule_email_send"]) {
    assert.ok(!draft.tools.includes(tool));
  }
});

test("uncertain or changed-source continuation references are bounded reads, not replacement writes", () => {
  for (const key of ["uncertain-reply", "changed-source"]) {
    const row = cases.find(candidate => candidate.actionAgentCase === key);
    assert.equal(row.approval, "none");
    assert.ok(row.tools.length <= 1);
    for (const tool of row.tools) assert.ok(["get_email", "get_email_context"].includes(tool));
    for (const tool of row.forbiddenTools) assert.ok(!row.tools.includes(tool));
  }
});

test("already answered request with an old draft has no write in its resolution reference", () => {
  const row = cases.find(candidate => candidate.actionAgentCase === "resolved-old-draft");
  assert.deepEqual(row.tools, ["get_email_context"]);
  for (const tool of row.forbiddenTools) assert.ok(!row.tools.includes(tool));
});
