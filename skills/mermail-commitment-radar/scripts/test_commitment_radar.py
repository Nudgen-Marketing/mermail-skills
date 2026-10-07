"""Acceptance tests for commitment_radar.py.

Run:  python3 test_commitment_radar.py
Exits 0 and prints ALL TESTS PASSED when every behavior holds.
All expectations are pinned to now = 2026-10-06T09:00:00Z against the
bundled fixture inbox (scripts/sample_inbox.json).
"""

import json
import subprocess
import sys
import tempfile
from datetime import date, datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import commitment_radar as cr  # noqa: E402

NOW = datetime(2026, 10, 6, 9, 0, 0, tzinfo=timezone.utc)
FIXTURE = HERE / "sample_inbox.json"


def by_thread(items):
    grouped = {}
    for item in items:
        grouped.setdefault(item["thread_id"], []).append(item)
    return grouped


def one(items, thread_id, item_type, subtype="__any__"):
    matches = [
        i
        for i in items
        if i["thread_id"] == thread_id
        and i["type"] == item_type
        and (subtype == "__any__" or i["subtype"] == subtype)
    ]
    assert len(matches) == 1, f"expected 1 {item_type}/{subtype} in {thread_id}, got {len(matches)}"
    return matches[0]


def main():
    inbox = cr.load_inbox(FIXTURE)
    items = cr.extract_items(inbox, NOW)
    grouped = by_thread(items)

    # --- Totals and noise immunity -------------------------------------
    assert len(items) == 10, f"expected 10 items, got {len(items)}"
    assert grouped.get("thr_injection", []) == [], "injection thread must yield zero items"
    assert grouped.get("thr_newsletter", []) == [], "newsletter must yield zero items"

    # --- thr_dataset: owner's overdue promise; request accepted ---------
    ds_promise = one(items, "thr_dataset", "owed_by_me")
    assert ds_promise["deadline"] == "2026-10-03", ds_promise["deadline"]
    assert ds_promise["status"] == "overdue", ds_promise["status"]
    assert ds_promise["source_message_id"] == "msg_d2"
    assert ds_promise["confidence"] == "high"
    ds_waiting = one(items, "thr_dataset", "waiting_on_me")
    assert ds_waiting["status"] == "accepted", ds_waiting["status"]

    # --- thr_vendor: counterparty promise overdue; ask answered --------
    vendor = one(items, "thr_vendor", "owed_to_me", "promise")
    assert vendor["deadline"] == "2026-10-02", vendor["deadline"]
    assert vendor["status"] == "overdue", vendor["status"]
    asked = one(items, "thr_vendor", "owed_to_me", "asked")
    assert asked["status"] == "answered", asked["status"]

    # --- thr_colleague: one open question waiting on the owner ---------
    col = one(items, "thr_colleague", "waiting_on_me")
    assert col["status"] == "open" and col["ball"] == "me"

    # --- thr_fulfilled: delivery evidence closes the item --------------
    ful = one(items, "thr_fulfilled", "owed_by_me")
    assert ful["status"] == "fulfilled", ful["status"]
    assert ful["evidence_message_id"] == "msg_f3", ful["evidence_message_id"]
    assert cr.urgency_score(ful, NOW) == 0

    # --- thr_ontrack: future deadline stays open ------------------------
    ontrack = one(items, "thr_ontrack", "owed_to_me", "promise")
    assert ontrack["deadline"] == "2026-10-12" and ontrack["status"] == "open"

    # --- thr_accept: acceptance converts the journal's request ---------
    acc = one(items, "thr_accept", "owed_by_me")
    assert acc["deadline"] == "2026-10-08" and acc["status"] == "open"
    assert one(items, "thr_accept", "waiting_on_me")["status"] == "accepted"

    # --- Urgency ordering ----------------------------------------------
    assert cr.urgency_score(ds_promise, NOW) > cr.urgency_score(ontrack, NOW)

    # --- Nudges: exactly one, for the silent vendor, quoting it ---------
    ledger = {"mailbox": inbox["mailbox"]["email"], "items": items}
    nudges = cr.render_nudges(ledger, NOW)
    assert nudges.count("### Draft nudge") == 1, nudges
    assert "thr_vendor" in nudges and "final quote" in nudges
    assert "DRAFT ONLY" in nudges
    assert "thr_dataset" not in nudges and "thr_colleague" not in nudges

    # --- Briefing structure ---------------------------------------------
    briefing = cr.render_briefing(ledger, NOW)
    for heading in ("## Overdue", "## Waiting on others", "## Waiting on you", "## Recently fulfilled"):
        assert heading in briefing, heading
    overdue_section = briefing.split("## Waiting on others")[0]
    assert "msg_d2" in overdue_section and "msg_v2" in overdue_section
    fulfilled_section = briefing.split("## Recently fulfilled")[1]
    assert "msg_f3" in fulfilled_section

    # --- Deadline parser unit checks -------------------------------------
    mon = datetime(2026, 9, 28, tzinfo=timezone.utc)  # a Monday
    assert cr.parse_deadline("by Friday", mon) == date(2026, 10, 2)
    assert cr.parse_deadline("by October 3", datetime(2026, 9, 29, tzinfo=timezone.utc)) == date(2026, 10, 3)
    assert cr.parse_deadline("tomorrow", datetime(2026, 9, 29, tzinfo=timezone.utc)) == date(2026, 9, 30)
    assert cr.parse_deadline("by 2026-11-01", mon) == date(2026, 11, 1)
    assert cr.parse_deadline("when you can", mon) is None
    assert cr.parse_deadline("next week", mon) == date(2026, 10, 5)

    # --- CLI smoke test ---------------------------------------------------
    with tempfile.TemporaryDirectory() as tmp:
        ledger_path = Path(tmp) / "ledger.json"
        scan = subprocess.run(
            [sys.executable, str(HERE / "commitment_radar.py"), "scan",
             "--inbox", str(FIXTURE), "--ledger", str(ledger_path),
             "--now", "2026-10-06T09:00:00Z"],
            capture_output=True, text=True,
        )
        assert scan.returncode == 0, scan.stderr
        saved = json.loads(ledger_path.read_text())
        assert len(saved["items"]) == 10
        brief = subprocess.run(
            [sys.executable, str(HERE / "commitment_radar.py"), "brief",
             "--ledger", str(ledger_path), "--now", "2026-10-06T09:00:00Z"],
            capture_output=True, text=True,
        )
        assert brief.returncode == 0, brief.stderr
        assert "## Overdue" in brief.stdout and "msg_d2" in brief.stdout
        assert "msg_f3" in brief.stdout

    print("ALL TESTS PASSED")


if __name__ == "__main__":
    main()
