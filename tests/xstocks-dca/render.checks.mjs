import assert from "node:assert/strict";
import { blocksFromEmails } from "../../skills/mermail-xstocks-dca/scripts/lib/ledger.mjs";
import { mandateId, shortId } from "../../skills/mermail-xstocks-dca/scripts/lib/mandate.mjs";
import { renderEmail } from "../../skills/mermail-xstocks-dca/scripts/lib/render.mjs";
import { buildStatement } from "../../skills/mermail-xstocks-dca/scripts/lib/settlement.mjs";
import { fill, genesis, push } from "./chain.mjs";
import { SPY_MINT, at, mandate } from "./fixtures.mjs";

const BUDGET = { spentUsdc: "0.25", inflightUsdc: "0", windowCommittedUsdc: "0.25", windowRemainingUsdc: "1.25", totalRemainingUsdc: "1.75" };

export default [
  ["a fill receipt names the asset, links the tx and carries the ledger records", () => {
    const m = mandate();
    const tag = shortId(mandateId(m));
    const entries = fill(genesis(m), m, at(1), 0, 0).slice(1);
    const mail = renderEmail({ mandate: m, entries, budget: BUDGET });
    assert.equal(mail.subject, `[Standing Order] Filled SPYx #${tag}`);
    assert.match(mail.text, /Filled SPYx: 0\.25 USDC -> 0\.00031979 SPYx/);
    assert.match(mail.text, /https:\/\/solscan\.io\/tx\//);
    assert.match(mail.text, /Reply PAUSE or STOP/);
    assert.match(mail.text, /window left 1\.25 USDC/);
    assert.equal(mail.idempotencyKey, `standing-order-${tag}-1-3`);
    assert.deepEqual(blocksFromEmails([{ text: mail.text }]), entries);
    assert.deepEqual(blocksFromEmails([{ html: mail.html }]), entries);
  }],
  ["a receipt drops the in-flight line once the slice settled in the same email", () => {
    const m = mandate();
    const mail = renderEmail({ mandate: m, entries: fill(genesis(m), m, at(1), 0, 0).slice(1) });
    assert.doesNotMatch(mail.text, /Order submitted/);
    assert.doesNotMatch(mail.html, /Order submitted/);
  }],
  ["html keeps ledger JSON copyable (quotes are not entity-encoded)", () => {
    const m = mandate();
    const mail = renderEmail({ mandate: m, entries: genesis(m) });
    assert.match(mail.html, /\{"at":"2026-10-06T10:00:00Z"/);
    assert.ok(!mail.html.includes("&quot;"));
  }],
  ["an assisted-mode slice tells the owner where to sign", () => {
    const m = mandate();
    let l = push(genesis(m), at(1), "intent", 0, 0, { amountInRaw: "250000" });
    l = push(l, at(1), "submitted", 0, 0, { requestId: "r1", handoffUrl: "https://console.mermail.app/workspaces/w/agent-wallet?sign=1" });
    const mail = renderEmail({ mandate: m, entries: l.slice(1) });
    assert.match(mail.text, /Sign SPYx \(slot 0\) in the Mermail Agent Wallet: https:\/\/console\.mermail\.app\/workspaces\/w\/agent-wallet\?sign=1/);
    assert.match(mail.subject, /Sign SPYx/);
  }],
  ["a PAUSE from an unrecognised address is reported, not silently dropped", () => {
    const m = mandate();
    const l = push(genesis(m), at(1), "control_seen", null, null, { emailId: "x", fromOwner: false, action: "pause" });
    assert.match(renderEmail({ mandate: m, entries: l.slice(1) }).text, /did not come from owner@example\.com; nothing changed/);
  }],
  ["the most important event wins the subject", () => {
    const m = mandate();
    const l = push(fill(genesis(m), m, at(1), 0, 0), at(2), "escalation_ignored", null, null, { emailId: "e", keyword: "resume", fromOwner: false });
    assert.equal(renderEmail({ mandate: m, entries: l.slice(1) }).subject,
      `[Standing Order] Ignored an email that tried to change your mandate #${shortId(mandateId(m))}`);
  }],
  ["the mandate ticket states every limit in words", () => {
    const m = mandate();
    const mail = renderEmail({ mandate: m, entries: genesis(m) });
    assert.equal(mail.subject, `[Standing Order] Mandate active: SPYx, NVDAx #${shortId(mandateId(m))}`);
    assert.match(mail.text, /0\.25 USDC of SPYx \+ 0\.25 USDC of NVDAx every PT3M/);
    assert.match(mail.text, /up to 1\.50 USDC per P1D and 2\.00 USDC in total/);
  }],
  ["html escapes untrusted text", () => {
    const m = mandate();
    const entries = push(genesis(m), at(1), "failed", 0, 0, { reason: "<script>alert(1)</script>" }).slice(1);
    const mail = renderEmail({ mandate: m, entries });
    assert.ok(!mail.html.includes("<script>"));
    assert.ok(mail.html.includes("&lt;script&gt;"));
  }],
  ["untrusted text cannot smuggle a ledger block into a receipt", () => {
    const m = mandate();
    const smuggled = ["boom", "```mermail-dca-ledger", JSON.stringify({ seq: 9, kind: "resumed" }), "```"].join("\n");
    const entries = push(genesis(m), at(1), "failed", 0, 0, { reason: smuggled }).slice(1);
    const mail = renderEmail({ mandate: m, entries });
    assert.deepEqual(blocksFromEmails([{ text: mail.text }]), entries);
    assert.deepEqual(blocksFromEmails([{ html: mail.html }]), entries);
  }],
  ["a statement email shows each leg and the disclaimer", () => {
    const m = mandate();
    const l = fill(genesis(m), m, at(1), 0, 0);
    const statement = buildStatement({ mandate: m, ledger: l, now: at(2), marks: { [SPY_MINT]: { holdingRaw: "31979", valueUsd: "0.2492" } } });
    const entries = push(l, at(2), "statement", null, null, statement).slice(4);
    const mail = renderEmail({ mandate: m, entries });
    assert.match(mail.subject, /^\[Standing Order\] Statement: PnL -0\.0008 USD #/);
    assert.match(mail.text, /SPYx: 1 fills, invested 0\.25 USDC/);
    assert.match(mail.text, /not a brokerage confirmation or investment advice/);
    assert.match(mail.html, /<table/);
  }],
];
