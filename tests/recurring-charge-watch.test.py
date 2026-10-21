#!/usr/bin/env python3
"""Actual offline helper/CLI regressions, not live-agent or provider tests.

Historical fixture bytes are immutable. Explicit flags on synthetic copies
model a known complete, native-clean response; they are never runtime defaults.
"""
import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
SKILL = ROOT / "skills/mermail-recurring-charge-watch"
HELPER = SKILL / "extract_recurring.py"
spec = importlib.util.spec_from_file_location("recurring", HELPER)
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)


def synthetic(body="We charged US$15.49. Monthly subscription. Next billing date: 2027-04-25.", **overrides):
    return {"id": "synthetic_001", "from": "Example <billing@example.test>",
            "to": "owner@example.test", "subject": "Your Example receipt",
            "scan_status": "clean", "content_omitted": False,
            "content_truncated": False, "body": body, **overrides}


def cli(payload):
    return subprocess.run([sys.executable, "-B", str(HELPER)], input=json.dumps(payload),
                          text=True, capture_output=True, timeout=5)


class RecurringTests(unittest.TestCase):
    def test_historical_fixtures_require_observed_flags(self):
        expected = ["unresolved_amount", None, "phishing", "one_shot_no_recurrence"]
        for index, path in enumerate(sorted((SKILL / "fixtures").glob("*.json"))):
            raw_bytes = path.read_bytes()
            original = json.loads(raw_bytes)
            with self.subTest(path=path.name):
                raw = cli(original)
                self.assertEqual(raw.returncode, 0)
                self.assertEqual(json.loads(raw.stdout)["skip_reason"], "unreadable")
                # Deliberately synthetic normalized copy; not a claim about the
                # historical fixture's absent provider body-completeness flags.
                known_complete = {**original, "content_omitted": False, "content_truncated": False}
                result = helper.extract_one(known_complete)
                self.assertEqual(result["skip_reason"], expected[index])
                self.assertEqual(path.read_bytes(), raw_bytes)
                if index == 1:
                    self.assertEqual((result["packet"]["amount"], result["packet"]["currency"]), ("480.00", "USD"))

    def test_scan_and_completeness_gates_before_body_access(self):
        class Poison:
            def __str__(self):
                raise AssertionError("unsafe body accessed")
        for status in [None, "unknown", "skipped", "flagged", "pending", True]:
            with self.subTest(status=status):
                result = helper.extract_one(synthetic(body=Poison(), scan_status=status))
                self.assertEqual(result["decision"], "skip")
        for field in ["content_omitted", "content_truncated"]:
            for value in [None, True, "false", 0]:
                with self.subTest(field=field, value=value):
                    candidate = synthetic(body=Poison(), **{field: value})
                    self.assertEqual(helper.extract_one(candidate)["skip_reason"], "unreadable")
            candidate = synthetic(body=Poison())
            del candidate[field]
            self.assertEqual(helper.extract_one(candidate)["skip_reason"], "unreadable")
        self.assertEqual(helper.extract_one(synthetic(body="x" * 12001))["skip_reason"], "unreadable")

    def test_money_exact_supported_values(self):
        for token, amount, currency in [("US$15", "15.00", "USD"), ("15.4 EUR", "15.40", "EUR"),
                                         ("GBP 1,234.56", "1234.56", "GBP"), ("€0.01", "0.01", "EUR"),
                                         ("USD 15.49 USD", "15.49", "USD"), ("$15.49 USD", "15.49", "USD")]:
            with self.subTest(token=token):
                result = helper.extract_one(synthetic(f"Amount: {token}. Monthly subscription."))
                self.assertEqual(result["decision"], "audit")
                self.assertEqual((result["packet"]["amount"], result["packet"]["currency"]), (amount, currency))

    def test_unresolved_money_never_guessed_or_truncated(self):
        for token in ["US$15.499", "US$15.490", "US$1e3", "US$1,23.45", "-US$15.49", "US$-15.49", "$15.49",
                      "15.49", "15.49 CAD", "$15.49 EUR", "USD 15.49 GBP", "$15.49 and $16.49",
                      "US$15.49EUR", "USD 15.49CAD", "EUR 15.49GBP"]:
            with self.subTest(token=token):
                result = helper.extract_one(synthetic(f"Amount: {token}. Monthly subscription."))
                self.assertEqual(result["skip_reason"], "unresolved_amount")
                self.assertIsNone(result["packet"])
        result = helper.extract_one(synthetic("Amount: US$15.49. Monthly subscription. Total: US$15.49."))
        self.assertEqual(result["decision"], "audit")

    def test_dates_need_unambiguous_calendar_value(self):
        for token in ["04/05/2027", "2027-02-30", "February 30, 2027", "25/25/2027"]:
            with self.subTest(token=token):
                result = helper.extract_one(synthetic(f"Amount: US$15.49. Monthly subscription. Renews on {token}."))
                self.assertEqual(result["skip_reason"], "unresolved_date")
        for token, expected in [("2027-04-25", "2027-04-25"), ("25/04/2027", "2027-04-25"),
                                ("04/25/2027", "2027-04-25"), ("04/04/2027", "2027-04-04"),
                                ("April 25, 2027", "2027-04-25")]:
            with self.subTest(token=token):
                result = helper.extract_one(synthetic(f"Amount: US$15.49. Monthly subscription. Renews on {token}."))
                self.assertEqual(result["packet"]["next_bill_date"], expected)

    def test_urls_fail_closed_without_fetching(self):
        for url in ["https://example.test:bad/manage", "https://example.test:70000/manage",
                    "https://[broken/manage", "http://example.test/manage", "https://127.0.0.1/manage",
                    "https://user:pass@example.test/manage", "https://bit.ly/manage", "https://example.test:8443/manage"]:
            with self.subTest(url=url):
                self.assertIsNone(helper._safe_https_url(url))
                result = helper.extract_one(synthetic(f"Amount: US$15.49. Monthly subscription. Manage: {url}"))
                self.assertIsNone(result["packet"]["manage_or_cancel_url"])
                self.assertFalse(result["safety"]["url_fetched"])
        self.assertEqual(helper._safe_https_url("https://example.test:443/manage"), "https://example.test:443/manage")

    def test_otp_and_unreadable_outputs_do_not_echo_private_material(self):
        marker = "PRIVATE_654321_BODY_MARKER"
        for candidate in [synthetic(f"Verification code {marker}. Monthly subscription. Amount: $15.49."),
                          synthetic(subject=f"Your code is {marker}"),
                          synthetic(marker, scan_status="unknown"),
                          synthetic(marker, content_omitted=True)]:
            with self.subTest(candidate=candidate):
                result = helper.extract_one(candidate)
                self.assertEqual(result["decision"], "skip")
                self.assertNotIn(marker, json.dumps(result))
                self.assertNotIn("subject", result["source"])

    def test_actual_cli_success_and_fixed_diagnostics(self):
        original = synthetic()
        untouched = copy.deepcopy(original)
        result = cli(original)
        self.assertEqual(result.returncode, 0)
        output = json.loads(result.stdout)
        self.assertEqual(output["packet"]["operator_gate"], "awaiting_approval")
        self.assertEqual(output["packet"]["wallet_gate"], "blocked_until_fresh_yes")
        self.assertFalse(output["safety"]["auto_pay"])
        self.assertEqual(original, untouched)
        for invalid in [[original, "PRIVATE_MARKER"], "PRIVATE_MARKER", [original] * 101]:
            failed = cli(invalid)
            self.assertEqual(failed.returncode, 2)
            self.assertEqual(failed.stdout, "")
            self.assertEqual(failed.stderr, "error: invalid or oversized email JSON input\n")
        for invalid in ['{"body":"PRIVATE_MARKER"', 'x' * 2_000_001]:
            failed = subprocess.run([sys.executable, "-B", str(HELPER)], input=invalid,
                                    text=True, capture_output=True, timeout=5)
            self.assertEqual(failed.returncode, 2)
            self.assertNotIn("PRIVATE_MARKER", failed.stderr)


if __name__ == "__main__":
    unittest.main(verbosity=2)
