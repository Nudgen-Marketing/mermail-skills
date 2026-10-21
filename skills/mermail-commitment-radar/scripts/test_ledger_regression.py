"""Offline behavioral/storage regressions; no network, mailbox or credentials."""
import copy
import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

import commitment_radar as cr
from ledger_store import load_ledger, save_ledger

NOW = datetime(2026, 10, 6, 9, tzinfo=timezone.utc)
HERE = Path(__file__).resolve().parent


class LedgerRegression(unittest.TestCase):
    def setUp(self):
        self.inbox = cr.load_inbox(HERE.parents[2] / "tests/fixtures/commitment-radar/inbox.json")

    def test_missing_or_failed_scan_cannot_create_or_close(self):
        for thread in self.inbox["threads"]:
            for m in thread["messages"]:
                m.pop("scan_status", None)
        self.assertEqual(cr.extract_items(self.inbox, NOW), [])

    def test_from_only_cannot_create_owner_promise(self):
        t = self.inbox["threads"][0]
        t["messages"][1]["direction"] = "received"
        items = cr.extract_items(self.inbox, NOW)
        self.assertFalse(any(x["source_message_id"] == "msg_d2" for x in items))

    def test_attachment_and_unrelated_promise_do_not_close_other_items(self):
        for t in self.inbox["threads"]:
            for m in t["messages"]:
                m.pop("reviewed_links", None)
        items = cr.extract_items(self.inbox, NOW)
        self.assertFalse(any(x["status"] in ("fulfilled", "accepted", "answered") for x in items))

    def test_link_from_unrelated_participant_cannot_fulfill(self):
        t = next(t for t in self.inbox["threads"] if t["id"] == "thr_fulfilled")
        t["messages"][-1]["from"] = "outsider@example.test"
        t["messages"][-1]["direction"] = "received"
        t["messages"][-1]["to"] = [self.inbox["mailbox"]["email"]]
        items = cr.extract_items(self.inbox, NOW)
        self.assertNotEqual(next(x for x in items if x["source_message_id"] == "msg_f2")["status"], "fulfilled")

    def test_same_words_different_message_do_not_collapse(self):
        t = self.inbox["threads"][0]
        m = copy.deepcopy(t["messages"][1])
        m.update(id="msg_d3", date="2026-10-01T09:00:00Z")
        t["messages"].append(m)
        ids = [x["id"] for x in cr.extract_items(self.inbox, NOW) if x["type"] == "owed_by_me" and x["thread_id"] == t["id"]]
        self.assertEqual(len(ids), 2)
        self.assertEqual(len(set(ids)), 2)

    def test_two_promises_in_one_message_require_distinct_item_links(self):
        snapshot = {"mailbox": self.inbox["mailbox"], "threads": [{"id": "two", "messages": [
            {"id": "source", "date": "2026-10-01T09:00:00Z", "from": self.inbox["mailbox"]["email"],
             "to": ["customer@example.test"], "body": "I'll send the dataset by October 2. I'll send the slides by October 2.",
             "direction": "sent", "scan_status": "clean"},
            {"id": "delivery", "date": "2026-10-02T09:00:00Z", "from": self.inbox["mailbox"]["email"],
             "to": ["customer@example.test"], "body": "Here is the dataset.", "attachments": ["dataset.csv"],
             "direction": "sent", "scan_status": "clean"}
        ]}]}
        items = cr.extract_items(snapshot, NOW)
        selected = next(x for x in items if "dataset" in x["text"])
        message = snapshot["threads"][0]["messages"][1]
        message["reviewed_links"] = [{"kind": "fulfills", "source_message_id": "source", "item_id": selected["id"]}]
        result = cr.extract_items(snapshot, NOW)
        self.assertEqual(next(x for x in result if "dataset" in x["text"])["status"], "fulfilled")
        self.assertEqual(next(x for x in result if "slides" in x["text"])["status"], "overdue")
        message["reviewed_links"] = [{"kind": "fulfills", "source_message_id": "source"}]
        self.assertTrue(all(x["status"] != "fulfilled" for x in cr.extract_items(snapshot, NOW)))

    def test_incremental_preserves_missing_items_and_human_state(self):
        first = cr.reconcile_ledger(self.inbox, None, NOW)
        first["items"][0]["human_note"] = "Reviewed privately"
        first["items"][0]["draft_state"] = "uncertain"
        subset = copy.deepcopy(self.inbox)
        subset["threads"] = []
        second = cr.reconcile_ledger(subset, first, NOW)
        self.assertEqual(len(second["items"]), len(first["items"]))
        self.assertEqual(second["items"][0]["human_note"], "Reviewed privately")
        self.assertEqual(second["items"][0]["draft_state"], "uncertain")
        self.assertTrue(all(x["audit_state"] == "not_observed_this_pass" for x in second["items"]))
        self.assertEqual(cr.render_nudges(second, NOW), "")

    def test_rerun_idempotent_and_does_not_reopen_closed_items(self):
        first = cr.reconcile_ledger(self.inbox, None, NOW)
        plain = copy.deepcopy(self.inbox)
        for t in plain["threads"]:
            for m in t["messages"]:
                m.pop("reviewed_links", None)
        second = cr.reconcile_ledger(plain, first, NOW)
        self.assertEqual(len(second["items"]), len(first["items"]))
        self.assertEqual([x["status"] for x in second["items"]], [x["status"] for x in first["items"]])

    def test_cross_workspace_and_legacy_identity_rejected(self):
        first = cr.reconcile_ledger(self.inbox, None, NOW)
        self.inbox["mailbox"]["workspace_id"] = "other"
        with self.assertRaises(ValueError):
            cr.reconcile_ledger(self.inbox, first, NOW)
        with self.assertRaises(ValueError):
            cr.reconcile_ledger(self.inbox, {"mailbox": "legacy", "items": []}, NOW)

    def test_unknown_save_or_recent_nudge_not_replayed(self):
        ledger = cr.reconcile_ledger(self.inbox, None, NOW)
        for x in ledger["items"]:
            x["draft_state"] = "uncertain"
        self.assertEqual(cr.render_nudges(ledger, NOW), "")
        for x in ledger["items"]:
            x["draft_state"] = "saved"
            x["last_nudge_at"] = "2026-10-05T09:00:00Z"
        self.assertEqual(cr.render_nudges(ledger, NOW), "")

    def test_storage_compare_exchange_and_lock_preserve_winner(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp).resolve() / "ledger.json"
            ledger = cr.reconcile_ledger(self.inbox, None, NOW)
            save_ledger(path, ledger, None)
            actual, old_bytes = load_ledger(path)
            actual["items"][0]["human_note"] = "newer edit"
            save_ledger(path, actual, old_bytes)
            with self.assertRaises(ValueError):
                save_ledger(path, ledger, old_bytes)
            self.assertEqual(load_ledger(path)[0]["items"][0]["human_note"], "newer edit")
            lock = path.with_name(path.name + ".lock")
            lock.touch()
            with self.assertRaises(FileExistsError):
                save_ledger(path, actual, load_ledger(path)[1])
            self.assertTrue(lock.exists())

    def test_symlink_and_corrupt_json_rejected_without_overwrite(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp).resolve() / "ledger.json"
            path.write_text("not json")
            with self.assertRaises(json.JSONDecodeError):
                load_ledger(path)
            self.assertEqual(path.read_text(), "not json")
            link = path.with_name("link.json")
            link.symlink_to(path)
            with self.assertRaises(ValueError):
                load_ledger(link)

    def test_bounds_fail_instead_of_silently_reading_unbounded_context(self):
        self.inbox["threads"] *= 4
        with self.assertRaises(ValueError):
            cr.extract_items(self.inbox, NOW)


if __name__ == "__main__":
    unittest.main()
