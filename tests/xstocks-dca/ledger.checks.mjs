import assert from "node:assert/strict";
import { canonical } from "../../skills/mermail-xstocks-dca/scripts/lib/core.mjs";
import {
  GENESIS_PREV, appendEntry, blocksFromEmails, compareLedgers, extractLedgerBlocks, ledgerBlock, rebuildLedger, verifyChain,
} from "../../skills/mermail-xstocks-dca/scripts/lib/ledger.mjs";
import { mandateId } from "../../skills/mermail-xstocks-dca/scripts/lib/mandate.mjs";
import { fill, genesis, push } from "./chain.mjs";
import { at, mandate } from "./fixtures.mjs";

const sample = () => {
  const m = mandate();
  let l = fill(genesis(m), m, at(1), 0, 0);
  l = push(l, at(2), "refused", 0, 1, { reason: "cap_window" });
  return { m, l };
};
const escapeHtml = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export default [
  ["a fresh chain verifies and links every entry", () => {
    const { m, l } = sample();
    const verdict = verifyChain(l, mandateId(m));
    assert.equal(verdict.ok, true);
    assert.equal(verdict.length, 5);
    assert.equal(l[0].prev, GENESIS_PREV);
    assert.equal(l[3].prev, l[2].hash);
  }],
  ["editing a recorded amount breaks the hash", () => {
    const { m, l } = sample();
    const forged = structuredClone(l);
    forged[3].data.amountInRaw = "1";
    assert.deepEqual(verifyChain(forged, mandateId(m)), { ok: false, reason: "hash", seq: 3 });
  }],
  ["dropping an entry breaks the sequence", () => {
    const { m, l } = sample();
    const verdict = verifyChain([...l.slice(0, 2), ...l.slice(3)], mandateId(m));
    assert.equal(verdict.ok, false);
    assert.equal(verdict.seq, 2);
  }],
  ["a ledger for another mandate is rejected", () => {
    const { l } = sample();
    const other = mandate();
    other.caps.totalUsdc = "9.00";
    assert.deepEqual(verifyChain(l, mandateId(other)), { ok: false, reason: "mandate_mismatch", seq: 0 });
  }],
  ["appendEntry enforces known kinds, genesis first and forward time", () => {
    const m = mandate();
    const l = genesis(m);
    assert.throws(() => appendEntry(l, { at: at(1), kind: "bought" }), (error) => error.code === "ledger_kind");
    assert.throws(() => appendEntry([], { at: at(1), kind: "filled" }), (error) => error.code === "ledger_genesis");
    assert.throws(() => appendEntry(l, { at: "2026-10-06T09:00:00Z", kind: "paused" }), (error) => error.code === "ledger_time_reversed");
  }],
  ["ledger blocks round-trip through plain text, CRLF and HTML", () => {
    const { l } = sample();
    const text = `hello\n${l.map(ledgerBlock).join("\n")}\nbye`;
    assert.deepEqual(extractLedgerBlocks(text), l);
    assert.deepEqual(extractLedgerBlocks(text.replace(/\n/g, "\r\n")), l);
    assert.deepEqual(blocksFromEmails([{ html: `<pre>${escapeHtml(text)}</pre>` }]), l);
  }],
  ["a block soft-wrapped by a mail client is still recovered", () => {
    const { l } = sample();
    const line = canonical(l[3]);
    const wrapped = `\`\`\`mermail-dca-ledger\n${line.slice(0, 70)}\n${line.slice(70)}\n\`\`\``;
    assert.deepEqual(extractLedgerBlocks(wrapped), [l[3]]);
  }],
  ["rebuild accepts shuffled and duplicated receipts", () => {
    const { m, l } = sample();
    const result = rebuildLedger([l[4], l[1], l[0], l[3], l[1], l[2], l[4]], mandateId(m));
    assert.equal(result.ok, true);
    assert.deepEqual(result.ledger, l);
  }],
  ["rebuild fails closed on conflicting blocks, gaps and garbage", () => {
    const { m, l } = sample();
    const twin = { ...l[2], data: { requestId: "other" } };
    assert.equal(rebuildLedger([...l, twin], mandateId(m)).reason, "conflicting_blocks");
    assert.equal(rebuildLedger([l[0], l[1], l[3]], mandateId(m)).reason, "gap");
    assert.equal(rebuildLedger([{ malformed: true }], mandateId(m)).reason, "malformed_block");
  }],
  ["negative control: a fully re-hashed forgery passes verifyChain but not the mailed copy", () => {
    const { m, l } = sample();
    let forged = l.slice(0, 3);
    for (const entry of l.slice(3)) {
      const data = entry.seq === 3 ? { ...entry.data, amountInRaw: "1" } : entry.data;
      forged = appendEntry(forged, { at: entry.at, kind: entry.kind, slot: entry.slot, leg: entry.leg, data }).ledger;
    }
    assert.equal(verifyChain(forged, mandateId(m)).ok, true, "the forgery is internally consistent");
    assert.deepEqual(compareLedgers(forged, l), { ok: false, reason: "diverged", seq: 3 });
    assert.deepEqual(compareLedgers(l, l), { ok: true, comparedThroughSeq: 4 });
  }],
];
