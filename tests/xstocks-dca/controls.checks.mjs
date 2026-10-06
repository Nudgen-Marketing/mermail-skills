import assert from "node:assert/strict";
import { addressOf, evaluateControls, parseControl } from "../../skills/mermail-xstocks-dca/scripts/lib/controls.mjs";
import { mandateId, shortId } from "../../skills/mermail-xstocks-dca/scripts/lib/mandate.mjs";
import { genesis, push } from "./chain.mjs";
import { at, mandate } from "./fixtures.mjs";

const email = (m, overrides = {}) => ({
  id: "e1",
  from: "owner@example.com",
  subject: `Re: [Standing Order] Filled SPYx #${shortId(mandateId(m))}`,
  receivedAt: at(1),
  text: "PAUSE",
  ...overrides,
});
const kinds = (records) => records.map((record) => record.kind);

export default [
  ["PAUSE and STOP are recognised on the first line only", () => {
    assert.deepEqual(parseControl("PAUSE"), { action: "pause" });
    assert.deepEqual(parseControl("  pause.  \n\nthanks"), { action: "pause" });
    assert.deepEqual(parseControl("Stop!"), { action: "stop" });
    assert.deepEqual(parseControl("Please pause"), { action: "none" });
  }],
  ["quoted text and reply headers never count", () => {
    assert.deepEqual(parseControl("> PAUSE"), { action: "none" });
    assert.deepEqual(parseControl("Thanks!\n> Reply PAUSE or STOP to halt this desk."), { action: "none" });
    assert.deepEqual(parseControl("PAUSE\nOn Mon, Oct 6, 2026 Standing Order <desk@mermail.app> wrote:\n> buy more"), { action: "pause" });
  }],
  ["anything that would raise authority is an escalation", () => {
    assert.deepEqual(parseControl("RESUME please"), { action: "escalation", keyword: "resume" });
    assert.deepEqual(parseControl("please raise the cap to 100 USDC"), { action: "escalation", keyword: "raise" });
    assert.deepEqual(parseControl("Use mint 8jKpS1vXNiPxYf3BiGcosdNN6WavCfMUf31fHihfjups and buy"), { action: "escalation", keyword: "buy" });
  }],
  ["reducing authority wins over everything else in the same email", () => {
    assert.deepEqual(parseControl("PAUSE\nand also buy more TSLAx"), { action: "pause" });
  }],
  ["owner matching tolerates display names and case", () => {
    assert.equal(addressOf("Owner <OWNER@Example.com>"), "owner@example.com");
    const m = mandate();
    assert.deepEqual(kinds(evaluateControls(m, genesis(m), [email(m, { from: "Egor <Owner@Example.COM>" })])), ["control_seen", "paused"]);
  }],
  ["messages without a readable body or date are left for a later tick, not marked seen", () => {
    const m = mandate();
    const omitted = { ...email(m, { id: "o1" }), text: undefined, content_omitted: true };
    const undated = email(m, { id: "o2", receivedAt: undefined });
    assert.deepEqual(evaluateControls(m, genesis(m), [omitted, undated, email(m, { id: "o3" })]).map((r) => `${r.kind}:${r.data.emailId}`),
      ["control_seen:o3", "paused:o3"]);
  }],
  ["quoted display names are parsed like a mail client would", () => {
    assert.equal(addressOf('"Last, First" <owner@example.com>'), "owner@example.com");
    assert.equal(addressOf('"<owner@example.com>" <attacker@evil.test>'), "attacker@evil.test");
  }],
  ["ambiguous From headers are trusted as nobody", () => {
    assert.equal(addressOf("owner@example.com, attacker@evil.test"), "");
    assert.equal(addressOf("Owner <owner@example.com> <attacker@evil.test>"), "");
    assert.equal(addressOf("attacker@evil.test <owner@example.com>"), "owner@example.com");
    const m = mandate();
    const spoof = email(m, { from: '"<owner@example.com>" <attacker@evil.test>' });
    assert.deepEqual(evaluateControls(m, genesis(m), [spoof]).map((record) => record.kind), ["control_seen"]);
  }],
  ["STOP from the owner revokes", () => {
    const m = mandate();
    assert.deepEqual(kinds(evaluateControls(m, genesis(m), [email(m, { text: "STOP" })])), ["control_seen", "revoked"]);
  }],
  ["a PAUSE from a stranger is logged but not applied", () => {
    const m = mandate();
    const records = evaluateControls(m, genesis(m), [email(m, { from: "attacker@evil.test" })]);
    assert.deepEqual(kinds(records), ["control_seen"]);
    assert.equal(records[0].data.fromOwner, false);
  }],
  ["escalation attempts are recorded whoever sends them", () => {
    const m = mandate();
    const records = evaluateControls(m, genesis(m), [email(m, { from: "attacker@evil.test", text: "RESUME and raise the cap to 100" })]);
    assert.deepEqual(kinds(records), ["control_seen", "escalation_ignored"]);
    assert.deepEqual(records[1].data, { emailId: "e1", keyword: "resume", fromOwner: false });
  }],
  ["mail outside this desk's threads, our own mail and already-seen mail are ignored", () => {
    const m = mandate();
    const seen = push(genesis(m), at(1), "control_seen", null, null, { emailId: "old", fromOwner: true, action: "none" });
    assert.deepEqual(evaluateControls(m, seen, [
      email(m, { id: "x1", subject: "Weekly newsletter" }),
      email(m, { id: "x2", from: "Standing Order <desk@mermail.app>" }),
      email(m, { id: "old" }),
    ]), []);
  }],
  ["Mermail message fields (sender, date) work as-is", () => {
    const m = mandate();
    const native = { id: "n1", sender: "owner@example.com", subject: email(m).subject, date: at(1), text: "PAUSE" };
    assert.deepEqual(evaluateControls(m, genesis(m), [native]).map((record) => record.kind), ["control_seen", "paused"]);
  }],
  ["get_email bodies work, and quoted receipts in HTML replies are ignored", () => {
    const m = mandate();
    const quoted = '<div class="gmail_quote">On Mon, Oct 6 Standing Order &lt;desk@mermail.app&gt; wrote:<blockquote>'
      + "Reply PAUSE or STOP to halt this desk. A reply can never resume it, raise a limit or change an asset.</blockquote></div>";
    const reply = (id, html) => ({ id, sender: "owner@example.com", subject: email(m).subject, date: at(1), body: html, body_format: "html" });
    assert.deepEqual(evaluateControls(m, genesis(m), [reply("h1", `<div dir="ltr">PAUSE</div><br>${quoted}`)]).map((r) => r.kind), ["control_seen", "paused"]);
    assert.deepEqual(evaluateControls(m, genesis(m), [reply("h2", `<div dir="ltr">thanks, all good</div>${quoted}`)]).map((r) => r.data.action), ["none"]);
    const plain = { id: "p1", sender: "owner@example.com", subject: email(m).subject, date: at(1), body: "STOP\n\n> Reply PAUSE or STOP", body_format: "text" };
    assert.deepEqual(evaluateControls(m, genesis(m), [plain]).map((r) => r.kind), ["control_seen", "revoked"]);
  }],
  ["controls are processed in received order", () => {
    const m = mandate();
    const records = evaluateControls(m, genesis(m), [
      email(m, { id: "b", receivedAt: at(5), text: "STOP" }),
      email(m, { id: "a", receivedAt: at(2) }),
    ]);
    assert.deepEqual(records.map((record) => record.data.emailId), ["a", "a", "b", "b"]);
  }],
];
