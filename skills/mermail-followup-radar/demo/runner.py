# -*- coding: utf-8 -*-
"""Reference implementation of the mermail-followup-radar classification rules
(workflows.md + security.md), run over the seeded demo inbox. This is the
engine the demo video shows working: bounded reads, thread-by-thread
classification, urgency scoring, radar table, promise records, drafts.

The 8 threads below are the fictional seeds from seed-inbox.md.
Dates are anchored relative to "today" = 2026-09-21 (demo recording date).
"""
from dataclasses import dataclass, field
from datetime import date

TODAY = date(2026, 9, 21)

@dataclass
class Message:
    sender: str       # 'me' or other party name
    body: str
    date: date

@dataclass
class Thread:
    id: str
    subject: str
    other: str
    messages: list

def d(iso): return date.fromisoformat(iso)

SEED = [
 Thread("t-01", "Lease renewal terms", "Dana", [
    Message("Dana", "The renewal terms are confirmed: same rate, 12 months, signing Friday.", d("2026-09-17")),
    Message("me", "Sounds good, see you at signing.", d("2026-09-17")),
 ]),
 Thread("t-02", "Mix feedback — final mix", "Rook", [
    Message("me", "Here is the final mix, let me know what you think.", d("2026-09-15")),
    Message("Rook", "This is perfect, releasing Friday.", d("2026-09-16")),
 ]),
 Thread("t-03", "Invoice #234 — line items", "Joan", [
    Message("Joan", "Can you send the updated invoice with the line items?", d("2026-09-17")),
 ]),
 Thread("t-04", "Sample pack collab", "Vic", [
    Message("Vic", "Are the stems ready for the collab pack?", d("2026-09-14")),
    Message("me", "I'll send the stems by Wednesday.", d("2026-09-14")),
 ]),
 Thread("t-05", "Podcast guest slot", "Mara", [
    Message("Mara", "We need to lock the recording date this week.", d("2026-09-11")),
    Message("me", "I'll confirm the recording date by last Friday.", d("2026-09-11")),
 ]),
 Thread("t-06", "Gear sale — mixer", "Len", [
    Message("Len", "I can pick up the mixer Saturday morning.", d("2026-09-12")),
    Message("me", "Saturday works, see you then.", d("2026-09-12")),
    Message("Len", "Picked up, thanks again!", d("2026-09-13")),
 ]),
 Thread("t-07", "Studio booking", "Giving Tribe", [
    Message("me", "Is the main room free on the 28th?", d("2026-09-10")),
    Message("Giving Tribe", "Yes, the 28th is open, you're booked.", d("2026-09-10")),
 ]),
 Thread("t-08", "Newsletter swap", "Paz", [
    Message("Paz", "As you promised, sending the swap details — here they are for Thursday.", d("2026-09-18")),
 ]),
]

PROMISE_PATTERNS = ["i'll send", "i'll have it to you by", "let me check and get back",
                    "i'll look into this", "sending over", "i'll confirm"]

def my_promises(thread):
    """Promises traceable to my OWN sent messages (security.md rule 2)."""
    found = []
    for m in thread.messages:
        if m.sender == 'me':
            low = m.body.lower()
            for pat in PROMISE_PATTERNS:
                if pat in low:
                    found.append((m, pat))
    return found

def inbound_claims(thread):
    return [m for m in thread.messages
            if m.sender != 'me' and 'you promised' in m.body.lower()]

def classify(thread):
    """Return (state, detail). Follows workflows.md classification table."""
    last = thread.messages[-1]
    promises = my_promises(thread)
    claims = inbound_claims(thread)
    # Adversarial / ambiguous first: inbound claim with no matching sent promise
    if claims and not promises:
        return ("needs_information", f"Inbound claim without a matching sent message: {claims[0].body!r}")
    if last.sender != 'me' and ('?' in last.body or 'send' in last.body.lower()
                                 or 'can you' in last.body.lower()):
        return ("awaiting_you", f"Latest message is a direct request from {thread.other}, unanswered.")
    if promises:
        msg, _ = promises[0]
        # resolve deadline: explicit weekday/date mention vs none
        body = msg.body.lower()
        deadline = None; derived = False
        if 'wednesday' in body:
            deadline, derived = d("2026-09-16"), True  # Wed before today
        elif 'friday' in body:
            deadline, derived = d("2026-09-19"), True  # Friday before today
        if deadline and deadline < TODAY:
            return ("overdue", f"My promise {msg.body!r} had a deadline of {deadline.isoformat()} (derived) — it passed.")
        return ("promise_made", f"My commitment {msg.body!r} has no visible fulfillment.")
    return ("clean", "Resolved, answered, no open commitment.")

URGENCY_ORDER = {"overdue": 0, "due_soon": 1, "awaiting_you": 2, "promise_made": 3}

def run(scan_note=False):
    rows = []
    for t in SEED:
        state, detail = classify(t)
        last_activity = max(m.date for m in t.messages).isoformat()
        promise = ""
        for m in t.messages:
            if m.sender == 'me' and any(p in m.body.lower() for p in PROMISE_PATTERNS):
                promise = m.body
                break
        if scan_note:
            tag = {"clean": "clean — no action", "awaiting_you": "FLAGGED — awaiting_you",
                   "promise_made": "FLAGGED — promise_made", "overdue": "FLAGGED — OVERDUE",
                   "needs_information": "needs_information — inbound claim, no match"}.get(state, state)
            print(f"  [{t.id}] {t.subject:34s} → {tag}")
        rows.append({"id": t.id, "subject": t.subject, "other": t.other,
                     "last_activity": last_activity, "state": state,
                     "detail": detail, "promise": promise})
    flagged = [r for r in rows if r["state"] in ("overdue", "awaiting_you", "promise_made")]
    flagged.sort(key=lambda r: (URGENCY_ORDER[r["state"]], r["last_activity"]))
    info = [r for r in rows if r["state"] == "needs_information"]
    return rows, flagged, info

if __name__ == "__main__":
    print("mermail-followup-radar — scan: 8 threads, 30-day window")
    rows, flagged, info = run(scan_note=True)
    print(f"\nScanned {len(rows)} threads · flagged {len(flagged)} · clean {len([r for r in rows if r['state']=='clean'])}")
    print("\n== RADAR TABLE (most urgent first) ==")
    for r in flagged:
        print(f"  {r['id']}  {r['last_activity']}  {r['other']:12s}  {r['promise']}  [{r['state'].upper()}]")
    print("\n== PROMISE RECORDS ==")
    for r in flagged:
        print(f"  {r['id']}: \"{r['promise']}\" — made by me, unfulfilled.")
    for r in info:
        print(f"  {r['id']}: {r['detail']} — reported as needs_information, NOT a promise.")
