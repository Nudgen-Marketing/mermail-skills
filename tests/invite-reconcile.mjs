import test from "node:test";
import assert from "node:assert/strict";
import { parseInvite, reconcileInvites } from "../skills/mermail-invite-reconcile/scripts/reconcile.mjs";

const base = ({ method = "REQUEST", sequence = 1, stamp = "20260917T120000Z", summary = "Planning", organizer = "mailto:owner@example.com", start = "20260920T120000Z", extra = "" } = {}) => `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Spare//Invite test//EN\nMETHOD:${method}\nBEGIN:VEVENT\nUID:event-1\nORGANIZER:${organizer}\nSEQUENCE:${sequence}\nDTSTAMP:${stamp}\nDTSTART:${start}\nDTEND:20260920T130000Z\nSUMMARY:${summary}\n${extra}END:VEVENT\nEND:VCALENDAR\n`;

test("accepts first version, accepts newer, and ignores late old version", () => {
  const result = reconcileInvites([
    { label: "v1", ics: base() },
    { label: "v2", ics: base({ sequence: 2, stamp: "20260917T130000Z", summary: "Final planning" }) },
    { label: "late-v1", ics: base() },
  ]);
  assert.deepEqual(result.decisions.map((d) => d.decision), ["accepted", "accepted", "stale_ignored"]);
  assert.equal(result.winners["event-1\u0000mailto:owner@example.com"].sequence, 2);
});

test("same version content conflict and organizer mismatch require review", () => {
  const conflict = reconcileInvites([{ label: "a", ics: base() }, { label: "b", ics: base({ summary: "Changed" }) }]);
  assert.equal(conflict.decisions[1].decision, "needs_review");
  assert.equal(Object.keys(conflict.winners).length, 0);
  assert.equal(conflict.unresolved["event-1"].candidates.length, 2);
  assert.equal(conflict.hasReview, true);
  assert.equal(conflict.safeToUseWinners, false);
  const mismatch = reconcileInvites([{ label: "a", ics: base() }, { label: "b", ics: base({ organizer: "mailto:other@example.com" }) }]);
  assert.deepEqual(mismatch.decisions.map((d) => d.decision), ["accepted", "needs_review"]);
  assert.equal(Object.keys(mismatch.winners).length, 0);
});

test("recurrence, recurrence id, floating, and unknown timezone are review cases", () => {
  for (const [label, extra, start] of [
    ["rrule", "RRULE:FREQ=WEEKLY\n", undefined],
    ["recurrence-id", "RECURRENCE-ID:20260920T120000Z\n", undefined],
    ["unknown-tz", "", "20260920T120000"],
    ["floating-tzid", "", "20260920T120000"],
  ]) {
    let ics = base({ extra, start: start && label === "floating-tzid" ? start : undefined });
    if (label === "unknown-tz") ics = ics.replace("DTSTART:20260920T120000Z", "DTSTART;TZID=Moon/Base:20260920T120000");
    if (label === "floating-tzid") ics = ics.replace("DTSTART:20260920T120000", "DTSTART:20260920T120000");
    const parsed = parseInvite(ics);
    assert.equal(parsed.ok, false, label);
    assert.match(parsed.reason, /UTC|RRULE|RECURRENCE-ID/);
  }
});

test("identical same-sequence input is a duplicate and never replaces the winner", () => {
  const result = reconcileInvites([{ label: "first", ics: base() }, { label: "copy", ics: base({ stamp: "20260917T130000Z" }) }]);
  assert.deepEqual(result.decisions.map((d) => d.decision), ["accepted", "duplicate"]);
  assert.equal(result.winners["event-1\u0000mailto:owner@example.com"].dtstamp, "2026-09-17T12:00:00Z");
});

test("multi-value properties participate in conflict comparison", () => {
  const first = base({ extra: "CATEGORIES:ONE,TWO\n" });
  const changed = base({ extra: "CATEGORIES:ONE,THREE\n" });
  const result = reconcileInvites([{ label: "first", ics: first }, { label: "changed", ics: changed }]);
  assert.equal(result.decisions[1].decision, "needs_review");
  assert.equal(result.safeToUseWinners, false);
});

test("only REQUEST is active and invalid dates or reversed ranges are review cases", () => {
  for (const ics of [base({ method: "CANCEL" }), base({ method: "REPLY" }), base({ start: "20261340T256199Z" }), base({ stamp: "20261340T256199Z" }), base().replace("DTEND:20260920T130000Z", "DTEND:20260920T110000Z")]) {
    const parsed = parseInvite(ics);
    assert.equal(parsed.ok, false);
    assert.match(parsed.reason, /METHOD|UTC|after/);
  }
  assert.equal(parseInvite(base().replace("METHOD:REQUEST\n", "")).ok, false);
});
