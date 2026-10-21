"""Actual offline extractor/CLI boundaries; not a model or marketplace E2E."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "skills/mermail-hire-intake/scripts/extract_hire.py"
FIXTURES = SCRIPT.parent.parent / "fixtures"
spec = importlib.util.spec_from_file_location("extract_hire", SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class HireIntakeTests(unittest.TestCase):
    def classify(self, body, subject="AgenC hire paid: Research"):
        return module.classify(body, subject)

    def hire(self, amount="5", tail=""):
        return ("You were hired on listing LISTING_123.\n\n"
                "Brief: Compare protocol fees with cited sources.\n\n"
                f"Reward {amount} USDC. Deadline 24h. Order ORDER_123. {tail}")

    def test_shipped_positive_keeps_actual_brief_and_complete_fields(self):
        row = json.loads((FIXTURES / "hire_ok.json").read_text())
        ticket = self.classify(row["body"], row["subject"])
        self.assertEqual(ticket["action"], "awaiting_operator")
        self.assertEqual(ticket["brief"], "Compare Solana LST yield versus fee floor with cited sources.")
        self.assertEqual(ticket["listing"], "FUHxNsKC8wzVPzUiGbqwXVs5PubKWBBB4CRzS6xWRFHz")
        self.assertEqual(ticket["order_id"], "hire_1787829909_demo")
        self.assertEqual(ticket["deadline"], "24h")
        self.assertEqual((ticket["price"], ticket["asset"]), ("0.005", "SOL"))
        self.assertIn("Brief: " + ticket["brief"], ticket["evidence_spans"])

    def test_shipped_otp_stays_skip(self):
        row = json.loads((FIXTURES / "otp_skip.json").read_text())
        self.assertEqual(self.classify(row["body"], row["subject"])["reason"], "verification_not_hire")

    def test_negative_signed_and_malformed_amounts_never_positive_suffix(self):
        for amount in ["-5", "- 5", "+5", "+ 5", "\u22125", "1e3", "1,000", "5/10", "5.1.2", ".5", "00.5", "0"]:
            with self.subTest(amount=amount):
                ticket = self.classify(self.hire(amount))
                self.assertEqual(ticket["action"], "skip")
                self.assertEqual(ticket["reason"], "invalid_price")
                self.assertNotIn("price", ticket)

    def test_exact_decimal_strings_not_float_or_rounding(self):
        for amount in ["0.0000001", "5.000000", "9007199254740993.123456789012345678"]:
            ticket = self.classify(self.hire(amount))
            self.assertEqual(ticket["price"], amount)
            self.assertEqual(ticket["action"], "awaiting_operator")
        ticket = self.classify(self.hire("5.0000", "Reward 5 USDC."))
        self.assertEqual(ticket["price"], "5.0000")
        self.assertEqual(ticket["action"], "awaiting_operator")

    def test_nonhire_and_payment_demand_prose_skip(self):
        cases = [("Newsletter", "Save twenty percent on our newest plan."),
                 ("Invoice due", "Please remit USD100 by Friday."),
                 ("Order receipt", "Your order ORDER_123 was paid. Thanks for your purchase."),
                 ("Superteam newsletter", "Here are listing LISTING_123 and 5 USDC worth of news."),
                 ("AgenC update", "Brief: Read the announcement. Reward 5 USDC.")]
        for subject, body in cases:
            with self.subTest(subject=subject):
                self.assertEqual(self.classify(body, subject)["action"], "skip")

    def test_multiline_and_unlabelled_brief_preserved_not_notification_intro(self):
        body = "You were hired.\n\nBrief: Order the findings by cost.\nContinue with citations.\n\nInclude counterevidence.\n\nReward 5 USDC."
        ticket = self.classify(body)
        self.assertEqual(ticket["brief"], "Order the findings by cost.\nContinue with citations.\n\nInclude counterevidence.")
        ticket = self.classify("You were hired on listing LISTING_123.\n\nCompare three fee schedules.\n\nReward 5 USDC.")
        self.assertEqual(ticket["brief"], "Compare three fee schedules.")

    def test_missing_values_null_and_no_fabricated_deadline(self):
        ticket = self.classify("You were hired.\n\nBrief: Compare fees.")
        for key in ["listing", "order_id", "deadline", "price", "asset"]:
            self.assertIn(key, ticket)
            self.assertIsNone(ticket[key])
        self.assertEqual(ticket["confidence"], "low")

    def test_supported_notice_forms_and_brief_not_identifier_source(self):
        for subject in ["Atelier paid order ORDER_123", "Superteam bounty awarded"]:
            ticket = self.classify("Brief: Order findings by cost.\n\nReward 5 USDC.", subject)
            self.assertEqual(ticket["action"], "awaiting_operator")
            self.assertEqual(ticket["brief"], "Order findings by cost.")
            self.assertNotEqual(ticket["order_id"], "findings")
        ticket = self.classify("You were hired on listing LISTING_123.")
        self.assertEqual(ticket["brief"], "")
        self.assertEqual(ticket["confidence"], "low")
        self.assertEqual(ticket["action"], "awaiting_operator")

    def test_conflicting_terms_stop_instead_of_first_wins(self):
        for tail, reason in [("Reward 6 USDC.", "conflicting_prices"),
                             ("Order OTHER_123.", "conflicting_identifiers"),
                             ("\nDeadline 48h.", "conflicting_deadlines")]:
            ticket = self.classify(self.hire(tail=tail))
            self.assertEqual(ticket["action"], "skip")
            self.assertEqual(ticket["reason"], reason)

    def test_invalid_or_over_budget_library_input_skips(self):
        for body, subject in [(None, "hire paid"), ("brief", {}), ("x" * 10001, "hire paid")]:
            self.assertEqual(module.classify(body, subject)["action"], "skip")

    def test_real_cli_roundtrip_and_no_fixture_mutation(self):
        before = {p.name: p.read_bytes() for p in FIXTURES.glob("*.json")}
        env = {**os.environ, "PYTHONDONTWRITEBYTECODE": "1"}
        for name in ["hire_ok.json", "otp_skip.json"]:
            result = subprocess.run([sys.executable, str(SCRIPT), str(FIXTURES / name)], capture_output=True, text=True, check=True, env=env)
            ticket = json.loads(result.stdout)
            self.assertEqual(ticket["email_id"], json.loads(before[name])["email_id"])
        with tempfile.TemporaryDirectory(prefix="hire-intake-test-") as directory:
            path = Path(directory) / "negative.json"
            path.write_text(json.dumps({"body": self.hire("-5"), "subject": "AgenC hire paid", "email_id": "synthetic-negative"}))
            result = subprocess.run([sys.executable, str(SCRIPT), str(path)], capture_output=True, text=True, check=True, env=env)
            self.assertEqual(json.loads(result.stdout)["reason"], "invalid_price")
        self.assertEqual(before, {p.name: p.read_bytes() for p in FIXTURES.glob("*.json")})


if __name__ == "__main__":
    unittest.main()
