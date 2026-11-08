"""Actual offline helper and injected transport tests; no live API/credentials."""
import copy
import json
import os
import sys
import tempfile
import unittest
import urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "skills/mermail-bounty-ops/scripts"))
import review_inbox as runner

NOW = "2026-10-21T12:00:00Z"
WHO = {"workspace_id": "ws_test", "public_id": "mb_test", "email": "demo@example.test"}


def message(mid="m1", **extra):
    return {"id": mid, "subject": "Bounty announcement", "body": "Build a demo. Unsubscribe link in footer.",
            "scan_status": "clean", "folder_id": "inbox", "sender": "sponsor@example.test", "date": NOW, **extra}


def snapshot(*messages):
    return {"mailbox": WHO.copy(), "messages": list(messages)}


def terms(**extra):
    return {"currency": "USD", "payout_type": "explicit_first_prize", "individual_amount": "1000",
            "entry_count": "20", "effort_units": "2", "friction": "1.5", "deadline": "2026-11-01T00:00:00Z", **extra}


class RunnerTests(unittest.TestCase):
    def test_pending_then_clean_remains_reviewable(self):
        _, state = runner.review(snapshot(message(scan_status="pending")), None, NOW)
        self.assertEqual(state["seen"], {})
        report, _ = runner.review(snapshot(message()), state, NOW)
        self.assertEqual(len(report["cards"]), 1)

    def test_same_subject_is_not_identity_and_changes_are_reprocessed(self):
        report, state = runner.review(snapshot(message(), message("m2")), None, NOW)
        self.assertEqual(len(report["cards"]), 2)
        repeated, _ = runner.review(snapshot(message()), state, NOW)
        self.assertEqual(repeated["unchanged_clean_messages"], 1)
        changed, _ = runner.review(snapshot(message(body="Bounty terms changed: deposit required.")), state, NOW)
        self.assertTrue(changed["cards"][0]["updated_source"])
        self.assertEqual(changed["cards"][0]["verdict"], "blocked_capital")

    def test_partial_snapshots_do_not_erase_prior_seen_entries(self):
        _, state = runner.review(snapshot(message(), message("m2")), None, NOW)
        report, next_state = runner.review(snapshot(), state, NOW)
        self.assertEqual(next_state["seen"], state["seen"])
        self.assertEqual(report["selected_messages"], 0)

    def test_workspace_or_mailbox_mismatch_stops(self):
        _, state = runner.review(snapshot(message()), None, NOW)
        for key in WHO:
            other = snapshot(message())
            other["mailbox"][key] = "different"
            with self.assertRaises(ValueError):
                runner.review(other, state, NOW)

    def test_unsubscribe_footer_does_not_discard_opportunity(self):
        report, _ = runner.review(snapshot(message()), None, NOW)
        self.assertEqual(len(report["cards"]), 1)
        self.assertEqual(report["cards"][0]["verdict"], "needs_verification")

    def test_incomplete_or_nonclean_evidence_is_held_without_body_export(self):
        for changes in ({"content_omitted": True}, {"body_truncated": True}, {"content_truncated": True}, {"body": "x" * 8001}, {"folder_id": "sent"}, {"scan_status": None}):
            report, state = runner.review(snapshot(message(**changes)), None, NOW)
            self.assertEqual(state["seen"], {})
            self.assertEqual(report["cards"], [])
            self.assertEqual(len(report["holds"]), 1)
            self.assertNotIn("body", report["holds"][0])

    def test_unknown_dates_currency_pool_and_priors_are_not_invented(self):
        for change in ({"deadline": None}, {"currency": "POINTS"}, {"payout_type": "prize_pool"}, {"entry_count": None}, {"individual_amount": "NaN"}, {"extra": "private data"}):
            self.assertEqual(runner.scenario_score(terms(**change), NOW)["status"], "unscored")

    def test_asof_is_not_hardcoded_and_exact_expiry_is_expired(self):
        self.assertEqual(runner.scenario_score(terms(deadline=NOW), NOW)["status"], "expired")
        self.assertEqual(runner.scenario_score(terms(), "2027-01-01T00:00:00Z")["status"], "expired")
        with self.assertRaises(ValueError):
            runner.review(snapshot(), None, "2026-10-21")

    def test_transparent_decimal_scenario_and_blocker_ranking(self):
        score = runner.scenario_score(terms(), NOW)
        self.assertTrue(score["value"].startswith("16.666666"))
        self.assertFalse(score["execution_authorized"])
        self.assertEqual(score["inputs"]["entry_count"], "20")
        report, _ = runner.review(snapshot(message(), message("m2", body="Bounty: deposit required.")), None, NOW,
                                  {"m1": terms(), "m2": terms(individual_amount="999999999")})
        self.assertEqual(report["cards"][0]["scenario_rank_within_currency"], 1)
        self.assertNotIn("scenario_rank_within_currency", report["cards"][1])

    def test_duplicate_input_or_body_budget_fails(self):
        for snap in (snapshot(message(), message()), snapshot(*[message(str(i)) for i in range(11)])):
            with self.assertRaises(ValueError):
                runner.review(snap, None, NOW)

    def test_private_state_conflicting_writer_lock_and_corruption(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp).resolve() / "state.json"
            _, state = runner.review(snapshot(message()), None, NOW)
            runner.save_state(path, state, None)
            loaded, expected = runner.load_state(path)
            self.assertEqual(loaded, state)
            _, changed = runner.review(snapshot(message("m2")), loaded, NOW)
            runner.save_state(path, changed, expected)
            with self.assertRaises(ValueError):
                runner.save_state(path, state, expected)
            lock = path.with_name(path.name + ".lock")
            lock.touch()
            with self.assertRaises(FileExistsError):
                runner.save_state(path, changed, runner.load_state(path)[1])
            link = path.with_name("link.json")
            link.symlink_to(path)
            with self.assertRaises(ValueError):
                runner.load_state(link)
            path.write_text("not json")
            with self.assertRaises(json.JSONDecodeError):
                runner.load_state(path)
            self.assertEqual(path.read_text(), "not json")

    def test_injected_get_transport_only_reads_exact_selected_mailbox(self):
        calls = []
        class Reader:
            def get(self, path):
                calls.append(path)
                if len(calls) == 1:
                    return {**WHO, "can_receive": True, "receiving_status": "ready"}
                if len(calls) == 2:
                    return [{"id": "m1"}]
                return message()
        value = runner.fetch_snapshot(Reader(), WHO)
        self.assertEqual(len(value["messages"]), 1)
        self.assertEqual(len(calls), 3)
        self.assertTrue(all(p.startswith("/api/v1/mailboxes/mb_test") for p in calls))
        self.assertIn("require_scan_status=clean", calls[-1])

    def test_malformed_transport_shapes_stop_without_state_commit(self):
        mailbox = {**WHO, "can_receive": True, "receiving_status": "ready"}
        for replies in ([[], []], [mailbox, None], [mailbox, [None]], [mailbox, [{"id": "m1"}], []], [mailbox, [{"id": "m1"}], {"id": "other"}]):
            class Reader:
                def __init__(self):
                    self.values = iter(copy.deepcopy(replies))
                def get(self, path):
                    return next(self.values)
            with self.assertRaises(ValueError):
                runner.fetch_snapshot(Reader(), WHO)

    def test_no_deposit_statement_is_not_a_positive_capital_requirement(self):
        report, _ = runner.review(snapshot(message(body="Bounty terms: no deposit is required.")), None, NOW)
        self.assertEqual(report["cards"][0]["verdict"], "needs_verification")

    def test_http_client_rejects_resource_escape_and_does_not_forward_on_redirect(self):
        client = runner.RestReader("fixture-not-a-real-credential")
        for path in ("https://other.example/", "/api/v1/mailboxes/../secrets", "/api/v1/mailboxes/mb_test/send"):
            with self.assertRaises(ValueError):
                client.get(path)
        self.assertIsNone(runner.NoRedirect().redirect_request(None, None, 302, "Found", {}, "https://other.example/"))
        class RedirectFailure:
            def open(self, request, timeout):
                self.method = request.get_method()
                raise urllib.error.HTTPError(request.full_url, 302, "Found", {}, None)
        client.opener = RedirectFailure()
        with self.assertRaisesRegex(ValueError, "HTTP 302"):
            client.get("/api/v1/mailboxes/mb_test")
        self.assertEqual(client.opener.method, "GET")
        self.assertEqual(client.calls, 1)


if __name__ == "__main__":
    unittest.main()
