"""Offline/injected transport tests. No public network, credentials or delivery."""
import copy
import io
import json
import sys
import unittest
from email.message import Message
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "skills/mermail-bounty-ops/scripts"))
import review_sources as runner

NOW = "2026-10-21T12:00:00Z"
P = {"mailbox": {"workspace_id": "ws_demo", "public_id": "mb_demo", "email": "demo@example.test"},
     "keywords": ["python"], "minimum": "100", "currency": "USD", "sources": ["github", "superteam"], "repos": ["demo/repo"]}

def gh(**changes):
    return {"html_url": "https://github.com/demo/repo/issues/1", "title": "Python bounty", "body": "Build a parser",
            "state": "open", "updated_at": NOW, **changes}

def st(**changes):
    return {"slug": "python-demo", "title": "Python bounty", "status": "published", "rewardAmount": "200",
            "token": "USD", "deadline": "2026-11-01T00:00:00Z", "agentAccess": "UNKNOWN", **changes}

def snapshot(g=None, s=None):
    return {"github": {"items": [gh()] if g is None else g, "total_count": 1, "incomplete_results": False}, "superteam": [st()] if s is None else s}

class Sources(unittest.TestCase):
    def test_both_sources_are_claims_not_guaranteed_money(self):
        r = runner.review(P, snapshot(), NOW)
        self.assertEqual(len(r["cards"]), 2)
        self.assertTrue(all(c["verdict"] == "needs_verification" for c in r["cards"]))
        self.assertIsNone(r["cards"][0]["amount"])
        self.assertFalse(r["execution_authorized"])
        self.assertFalse(r["delivery_performed"])

    def test_unknown_units_and_numeric_pool_are_not_converted(self):
        for changes in ({"token": "COOK", "rewardAmount": "1"}, {"token": "USDC", "rewardAmount": "1"}, {"rewardAmount": 500.5}):
            r = runner.review(P, snapshot(s=[st(**changes)]), NOW)
            self.assertEqual(len(r["cards"]), 2)
        self.assertIsNone(r["cards"][1]["amount"])

    def test_observed_board_uppercase_status_and_exact_integer(self):
        r = runner.review(P, snapshot(s=[st(status="OPEN", rewardAmount=500)]), NOW)
        self.assertEqual(r["cards"][1]["amount"], "500")
        self.assertEqual(r["cards"][1]["payout_type"], "unknown_not_individual_income")

    def test_exact_same_unit_floor_and_dates(self):
        for changes, reason in (({"rewardAmount": "99"}, "quoted_total_below_same_unit_floor"),
                                ({"deadline": NOW}, "expired"), ({"deadline": "2026-11-01"}, "deadline_ambiguous_hold"),
                                ({"status": "not-open"}, "status_unknown_or_closed")):
            r = runner.review(P, snapshot(s=[st(**changes)]), NOW)
            self.assertEqual(r["filtered"][0]["reason"], reason)

    def test_unsupported_or_malicious_shapes_hold_source(self):
        for bad in (None, {"data": []}, [None], [st(slug="../other")], [st(description="x" * 2001)]):
            r = runner.review(P, {"github": snapshot()["github"], "superteam": bad}, NOW)
            self.assertIn("superteam", r["source_errors"])
            self.assertEqual(len(r["cards"]), 1)

    def test_repository_and_identity_binding(self):
        for item in (gh(html_url="https://github.com/attacker/repo/issues/1"), gh(pull_request={}), gh(html_url="https://evil.test/demo/repo/issues/1")):
            r = runner.review(P, snapshot(g=[item]), NOW)
            self.assertIn("github", r["source_errors"])

    def test_profile_has_no_default_repo_keywords_or_currency(self):
        for changes in ({"repos": []}, {"keywords": []}, {"minimum": "NaN"}, {"minimum": 100}, {"sources": ["evil"]}, {"currency": "COOK"}):
            with self.assertRaises(ValueError):
                runner.profile({**P, **changes})

    def test_manifest_binds_profile_and_preserves_revisions(self):
        original = runner.review(P, snapshot(), NOW)
        card = original["cards"][0]
        record = {"id": card["id"], "fingerprint": card["fingerprint"], "state": "delivered", "emailId": "sent_1"}
        manifest = {"profile_digest": original["profile_digest"], "records": [record]}
        unchanged = runner.review(P, snapshot(), NOW, manifest)
        self.assertEqual(unchanged["filtered"][0]["reason"], "already_delivered_unchanged")
        changed = runner.review(P, snapshot(g=[gh(body="Updated Python rules")]), NOW, manifest)
        self.assertTrue(changed["cards"][0]["updated_since_delivery"])
        with self.assertRaises(ValueError):
            runner.review({**P, "minimum": "101"}, snapshot(), NOW, manifest)

    def test_unknown_delivery_is_held_even_if_source_changes(self):
        r = runner.review(P, snapshot(), NOW)
        record = {"id": r["cards"][0]["id"], "fingerprint": r["cards"][0]["fingerprint"], "state": "uncertain"}
        manifest = {"profile_digest": r["profile_digest"], "records": [record]}
        held = runner.review(P, snapshot(g=[gh(body="Changed terms")]), NOW, manifest)
        self.assertEqual(held["filtered"][0]["reason"], "delivery_uncertain_hold_no_replay")
        self.assertEqual(len(held["cards"]), 1)

    def test_no_dedup_by_subject_and_duplicate_id_is_not_silently_lost(self):
        second = gh(html_url="https://github.com/demo/repo/issues/2")
        self.assertEqual(len(runner.review(P, snapshot(g=[gh(), second]), NOW)["cards"]), 3)
        self.assertIn("github", runner.review(P, snapshot(g=[gh(), gh()]), NOW)["source_errors"])

    def test_incomplete_and_budgets_are_visible(self):
        data = snapshot()
        data["github"]["incomplete_results"] = True
        self.assertTrue(runner.review(P, data, NOW)["source_coverage"]["github"]["partial"])
        data["github"]["items"] = [gh(html_url=f"https://github.com/demo/repo/issues/{i+1}") for i in range(51)]
        self.assertIn("github", runner.review(P, data, NOW)["source_errors"])

    def test_fixed_urls_no_credentials_and_partial_error_no_retry(self):
        calls = []
        def get(url):
            calls.append(url)
            if "superteam" in url:
                raise ValueError("do not expose error body")
            return snapshot()["github"]
        data, errors = runner.acquire(P, get)
        self.assertEqual(len(calls), 2)
        self.assertIn("repo%3Ademo%2Frepo", calls[0])
        self.assertIn("superteam", runner.review(P, data, NOW, errors=errors)["source_errors"])
        self.assertEqual(runner.review(P, data, NOW, errors=errors)["source_errors"]["superteam"], "source_unavailable_no_retry")

    def test_transport_bounds_and_no_redirect(self):
        url = runner.source_urls(P)["github"]
        class Response(io.BytesIO):
            status = 200
            headers = Message()
            headers["Content-Type"] = "application/json"
            def geturl(self):
                return url
        class Opener:
            def __init__(self, response):
                self.response = response
            def open(self, request, timeout):
                self.request, self.timeout = request, timeout
                return self.response
        opener = Opener(Response(b'{"items":[]}'))
        self.assertEqual(runner.fetch(url, opener), {"items": []})
        self.assertEqual(opener.request.get_method(), "GET")
        self.assertEqual(opener.timeout, 15)
        self.assertNotIn("Authorization", opener.request.headers)
        with self.assertRaises(ValueError):
            runner.fetch("http://api.github.com/search/issues", opener)
        for wrong in ("https://api.github.com/api/listings", "https://superteam.fun/search/issues", url + "#fragment"):
            with self.assertRaises(ValueError):
                runner.fetch(wrong, opener)
        response = Response(b"{}")
        response.geturl = lambda: "https://evil.test/"
        with self.assertRaises(ValueError):
            runner.fetch(url, Opener(response))
        with self.assertRaises(ValueError):
            runner.fetch(url, Opener(Response(b"x" * (runner.MAX_BYTES + 1))))

if __name__ == "__main__":
    unittest.main()
