#!/usr/bin/env python3
"""Unit tests for the mermail-receipt-auditor ledger engine.

Run:  python3 -m unittest discover skills/mermail-receipt-auditor/tests -v
"""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SKILL_DIR = Path(__file__).resolve().parent.parent
LEDGER = SKILL_DIR / "scripts" / "ledger.py"


def run_cli(*argv: str, cwd: str | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(LEDGER), *argv],
        capture_output=True, text=True, cwd=cwd,
    )


def add_receipt(dirpath: str, email_id: str, vendor: str, amount: str,
                currency: str, date: str, category: str = "uncategorized",
                confidence: str = "high") -> subprocess.CompletedProcess[str]:
    return run_cli(
        "add", "--dir", dirpath, "--email-id", email_id, "--mailbox-id", "mbx_pub_1",
        "--vendor", vendor, "--amount", amount, "--currency", currency,
        "--date", date, "--category", category, "--confidence", confidence,
        "--evidence", "Total: " + amount,
    )


class LedgerEngineTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.dir = self._tmp.name

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def ledger_path(self) -> Path:
        return Path(self.dir) / "ledger.jsonl"

    def lines(self) -> list[dict]:
        return [json.loads(l) for l in self.ledger_path().read_text().splitlines() if l.strip()]

    # -- add / schema -------------------------------------------------------

    def test_add_appends_valid_entry(self):
        r = add_receipt(self.dir, "em_1", "Acme Cloud", "49.00", "USD", "2026-08-03")
        self.assertEqual(r.returncode, 0, r.stderr)
        entry = self.lines()[0]
        self.assertEqual(entry["type"], "receipt")
        self.assertEqual(entry["vendor"], "Acme Cloud")
        self.assertEqual(entry["currency"], "USD")
        self.assertEqual(entry["schemaVersion"], 1)
        self.assertIn("recordedAt", entry)

    def test_add_rejects_bare_amount_bad_currency_and_bad_date(self):
        r = add_receipt(self.dir, "em_bad", "V", "12", "dollars", "2026-08-03")
        self.assertEqual(r.returncode, 1)
        self.assertIn("ISO 4217", r.stderr)
        r = add_receipt(self.dir, "em_bad2", "V", "12.00", "USD", "08/03/2026")
        self.assertEqual(r.returncode, 1)
        self.assertIn("ISO 8601", r.stderr)
        r = add_receipt(self.dir, "em_bad3", "V", "abc", "USD", "2026-08-03")
        self.assertEqual(r.returncode, 1)
        self.assertIn("decimal", r.stderr)
        self.assertFalse(self.ledger_path().exists(), "no ledger line may be written on rejection")

    def test_add_rejects_negative_amount(self):
        r = add_receipt(self.dir, "em_neg", "V", "-5.00", "USD", "2026-08-03")
        self.assertEqual(r.returncode, 1)
        self.assertIn("non-negative", r.stderr)

    def test_add_requires_fields(self):
        r = run_cli("add", "--dir", self.dir, "--email-id", "em_x", "--mailbox-id", "m",
                    "--vendor", "V", "--amount", "5.00", "--date", "2026-08-03")
        self.assertEqual(r.returncode, 0, "currency defaults to 'unknown', entry valid")
        r = run_cli("add", "--dir", self.dir, "--email-id", "em_x2", "--mailbox-id", "m",
                    "--vendor", "V", "--amount", "5.00", "--currency", "USD")
        self.assertEqual(r.returncode, 2, "missing --date is an argparse error")

    def test_currency_defaults_to_unknown(self):
        r = run_cli("add", "--dir", self.dir, "--email-id", "em_u", "--mailbox-id", "m",
                    "--vendor", "V", "--amount", "5.00", "--date", "2026-08-03",
                    "--confidence", "medium")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(self.lines()[0]["currency"], "unknown")

    # -- dedupe -------------------------------------------------------------

    def test_duplicate_emailid_skipped(self):
        self.assertEqual(add_receipt(self.dir, "em_1", "A", "10.00", "USD", "2026-08-03").returncode, 0)
        r = add_receipt(self.dir, "em_1", "A", "10.00", "USD", "2026-08-03")
        self.assertEqual(r.returncode, 2)
        self.assertIn("DUPLICATE_SKIPPED", r.stderr)
        self.assertEqual(len(self.lines()), 1)

    def test_same_receipt_redated_within_tolerance_skipped(self):
        add_receipt(self.dir, "em_1", "A", "10.00", "USD", "2026-08-03")
        r = add_receipt(self.dir, "em_2", "A", "10.00", "USD", "2026-08-04")
        self.assertEqual(r.returncode, 2)
        self.assertIn("within +/-1 day", r.stderr)

    def test_same_amount_two_days_apart_not_duplicate(self):
        add_receipt(self.dir, "em_1", "A", "10.00", "USD", "2026-08-03")
        r = add_receipt(self.dir, "em_2", "A", "10.00", "USD", "2026-08-05")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(len(self.lines()), 2)

    def test_different_currency_not_duplicate(self):
        add_receipt(self.dir, "em_1", "A", "10.00", "USD", "2026-08-03")
        r = add_receipt(self.dir, "em_2", "A", "10.00", "EUR", "2026-08-03")
        self.assertEqual(r.returncode, 0, r.stderr)

    # -- void / append-only -------------------------------------------------

    def test_void_and_effective_removal(self):
        add_receipt(self.dir, "em_1", "A", "10.00", "USD", "2026-08-03")
        r = run_cli("void", "--dir", self.dir, "--email-id", "em_1", "--reason", "duplicate vendor charge")
        self.assertEqual(r.returncode, 0, r.stderr)
        lines = self.lines()
        self.assertEqual(len(lines), 2, "void is an appended entry, history intact")
        self.assertEqual(lines[1]["type"], "void")
        self.assertEqual(lines[1]["voidsEmailId"], "em_1")
        q = run_cli("query", "--dir", self.dir)
        self.assertIn("0 receipts", q.stdout)
        # voiding again fails: entry no longer active
        r = run_cli("void", "--dir", self.dir, "--email-id", "em_1", "--reason", "again")
        self.assertEqual(r.returncode, 1)
        # voiding an unknown id fails
        r = run_cli("void", "--dir", self.dir, "--email-id", "nope", "--reason", "x")
        self.assertEqual(r.returncode, 1)

    # -- summary / query ----------------------------------------------------

    def seed(self):
        add_receipt(self.dir, "em_1", "Acme API", "49.00", "USD", "2026-08-03", "api-services")
        add_receipt(self.dir, "em_2", "Globex Hosting", "120.00", "USD", "2026-08-20", "hosting")
        add_receipt(self.dir, "em_3", "Acme API", "49.00", "USD", "2026-09-02", "api-services")
        add_receipt(self.dir, "em_4", "Euro VPS", "30.00", "EUR", "2026-08-25", "hosting")

    def test_summary_month_totals(self):
        self.seed()
        r = run_cli("summary", "--dir", self.dir)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("2026-08: 30.00 EUR, 169.00 USD", r.stdout)
        self.assertIn("2026-09: 49.00 USD", r.stdout)
        self.assertIn("TOTAL 30.00 EUR, 218.00 USD", r.stdout)

    def test_summary_period_and_category_filters(self):
        self.seed()
        r = run_cli("summary", "--dir", self.dir, "--period", "2026-08", "--by", "category")
        self.assertIn("2026-08|api-services: 49.00 USD", r.stdout)
        r = run_cli("query", "--dir", self.dir, "--period", "2026-08", "--category", "api-services")
        self.assertIn("49.00 USD", r.stdout)
        self.assertIn("1 receipts", r.stdout)

    def test_query_by_vendor(self):
        self.seed()
        r = run_cli("query", "--dir", self.dir, "--vendor", "Acme API")
        self.assertIn("2 receipts", r.stdout)
        self.assertIn("98.00 USD", r.stdout)

    def test_query_respects_voids(self):
        self.seed()
        run_cli("void", "--dir", self.dir, "--email-id", "em_3", "--reason", "test")
        r = run_cli("query", "--dir", self.dir, "--vendor", "Acme API")
        self.assertIn("1 receipts", r.stdout)

    # -- recurring ----------------------------------------------------------

    def test_recurring_detects_monthly_vendor(self):
        add_receipt(self.dir, "em_1", "Acme API", "49.00", "USD", "2026-06-03", "api-services")
        add_receipt(self.dir, "em_2", "Acme API", "49.00", "USD", "2026-07-03", "api-services")
        add_receipt(self.dir, "em_3", "Acme API", "49.00", "USD", "2026-08-03", "api-services")
        r = run_cli("recurring", "--dir", self.dir)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("RECURRING Acme API 49.00 USD x3", r.stdout)
        self.assertIn("cadence~30d", r.stdout)  # gaps 30d + 31d -> mean 30.5 -> 30
        self.assertIn("next~2026-09-02", r.stdout)
        self.assertIn("em_1, em_2, em_3", r.stdout)

    def test_recurring_gap_cap_excludes_wild_gaps(self):
        self.seed()
        add_receipt(self.dir, "em_5", "Wildcard Inc", "75.00", "USD", "2026-01-10")
        add_receipt(self.dir, "em_6", "Wildcard Inc", "75.00", "USD", "2026-07-10")
        r = run_cli("recurring", "--dir", self.dir)
        self.assertIn("RECURRING Acme API", r.stdout, "seed contains a ~30d pair")
        self.assertNotIn("Wildcard", r.stdout, "gap over max-gap-days is not recurring")
        r = run_cli("recurring", "--dir", self.dir, "--max-gap-days", "365")
        self.assertIn("RECURRING Wildcard Inc", r.stdout)

    def test_recurring_respects_voids(self):
        add_receipt(self.dir, "em_1", "Acme API", "49.00", "USD", "2026-07-03")
        add_receipt(self.dir, "em_2", "Acme API", "49.00", "USD", "2026-08-03")
        run_cli("void", "--dir", self.dir, "--email-id", "em_2", "--reason", "x")
        r = run_cli("recurring", "--dir", self.dir)
        self.assertIn("NO_RECURRING_CHARGES_DETECTED", r.stdout)

    def test_recurring_min_occurrences_flag(self):
        add_receipt(self.dir, "em_1", "Acme API", "49.00", "USD", "2026-07-03")
        add_receipt(self.dir, "em_2", "Acme API", "49.00", "USD", "2026-08-02")
        r = run_cli("recurring", "--dir", self.dir, "--min-occurrences", "3")
        self.assertIn("NO_RECURRING_CHARGES_DETECTED", r.stdout)
        r = run_cli("recurring", "--dir", self.dir, "--min-occurrences", "2")
        self.assertIn("x2", r.stdout)

    # -- csv / doctor / schema ----------------------------------------------

    def test_export_csv_derived_view(self):
        self.seed()
        run_cli("void", "--dir", self.dir, "--email-id", "em_4", "--reason", "test")
        r = run_cli("export-csv", "--dir", self.dir)
        self.assertEqual(r.returncode, 0, r.stderr)
        csv_text = (Path(self.dir) / "ledger.csv").read_text()
        rows = csv_text.strip().splitlines()
        self.assertEqual(len(rows), 4, "header + 3 active receipts (void excluded)")
        self.assertIn("Acme API", csv_text)
        self.assertNotIn("Euro VPS", csv_text)

    def test_doctor_detects_malformed_line(self):
        add_receipt(self.dir, "em_1", "A", "10.00", "USD", "2026-08-03")
        with self.ledger_path().open("a") as fh:
            fh.write("{not json}\n")
        r = run_cli("doctor", "--dir", self.dir)
        self.assertEqual(r.returncode, 1)
        self.assertIn("malformed JSONL", r.stderr)

    def test_doctor_ok_and_void_report(self):
        add_receipt(self.dir, "em_1", "A", "10.00", "USD", "2026-08-03")
        run_cli("void", "--dir", self.dir, "--email-id", "em_1", "--reason", "x")
        r = run_cli("doctor", "--dir", self.dir)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("LEDGER OK", r.stdout)
        self.assertIn("voids=1", r.stdout)

    def test_schema_command(self):
        r = run_cli("schema")
        self.assertEqual(r.returncode, 0)
        self.assertIn("append-only", r.stdout)

    def test_empty_ledger_queries(self):
        r = run_cli("summary", "--dir", self.dir)
        self.assertEqual(r.returncode, 0)
        self.assertIn("nothing recorded", r.stdout)
        r = run_cli("query", "--dir", self.dir)
        self.assertEqual(r.returncode, 0)
        self.assertIn("0 receipts", r.stdout)


if __name__ == "__main__":
    unittest.main()
