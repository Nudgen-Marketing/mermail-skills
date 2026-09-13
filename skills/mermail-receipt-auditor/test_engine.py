"""Unit tests for the mermail-receipt-auditor ledger engine.

Run: python3 test_engine.py
"""

import json
import os
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from engine import Ledger, LedgerError, parse_iso_date, validate_record  # noqa: E402


def rec(**kw):
    base = {
        "record_id": kw.pop("record_id", "r-000001"),
        "vendor": kw.pop("vendor", "OpenAI"),
        "amount_decimal": kw.pop("amount_decimal", "20.00"),
        "currency": kw.pop("currency", "USD"),
        "tx_date": kw.pop("tx_date", "2026-09-01T00:00:00+00:00"),
        "kind": kw.pop("kind", "RECEIPT"),
        "direction": kw.pop("direction", "debit"),
        "category": kw.pop("category", "api"),
        "tx_ref": kw.pop("tx_ref", "ord_123"),
        "source_message_id": kw.pop("source_message_id", "msg-1"),
    }
    base.update(kw)
    return base


class TestValidation(unittest.TestCase):
    def test_valid_record_passes(self):
        self.assertEqual(validate_record(rec())["vendor"], "OpenAI")

    def test_missing_field_raises(self):
        r = rec()
        del r["currency"]
        with self.assertRaises(LedgerError):
            validate_record(r)

    def test_bad_kind_raises(self):
        with self.assertRaises(LedgerError):
            validate_record(rec(kind="RECEIPTZZZ"))

    def test_bad_direction_raises(self):
        with self.assertRaises(LedgerError):
            validate_record(rec(direction="sideways"))

    def test_bad_date_raises(self):
        with self.assertRaises(LedgerError):
            validate_record(rec(tx_date="Septober 40, 2026"))

    def test_amount_coerced_to_string(self):
        r = validate_record(rec(amount_decimal=19.99))
        self.assertIsInstance(r["amount_decimal"], str)


class TestLedger(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.ledger = Ledger(self.dir)

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def test_ingest_and_duplicate(self):
        self.assertEqual(self.ledger.ingest(rec(source_message_id="m1")), "ingested")
        # same tuple → duplicate
        self.assertEqual(self.ledger.ingest(rec(source_message_id="m1")), "duplicate")
        # different message id → ingested (same receipt forwarded twice is still distinct mail)
        self.assertEqual(self.ledger.ingest(rec(source_message_id="m2")), "ingested")

    def test_append_only_with_correction(self):
        self.ledger.ingest(rec(record_id="r-1", source_message_id="m1"))
        self.ledger.correct("r-1", {"category": "saas"}, "vendor maps to saas not api")
        # master file still has both lines
        with open(self.ledger.jsonl_path, encoding="utf-8") as f:
            lines = [json.loads(l) for l in f if l.strip()]
        self.assertEqual(len(lines), 2)
        self.assertEqual(lines[1]["type"], "correction")
        # effective view applies the fix
        eff = self.ledger.effective_records()
        self.assertEqual(eff[0]["category"], "saas")
        self.assertTrue(eff[0]["corrected"])

    def test_quarantine_never_enters_ledger(self):
        p = self.ledger.quarantine("msg-suspect-9", "lookalike domain")
        self.assertTrue(os.path.exists(p))
        self.assertEqual(len(self.ledger.records), 0)

    def test_csv_regeneration(self):
        self.ledger.ingest(rec(record_id="r-1", source_message_id="m1"))
        self.ledger.ingest(rec(record_id="r-2", source_message_id="m2", vendor="Vercel", category="infra"))
        csv_path = self.ledger.regenerate_csv()
        with open(csv_path, encoding="utf-8") as f:
            rows = f.read().strip().splitlines()
        self.assertEqual(len(rows), 3)  # header + 2
        self.assertIn("Vercel", rows[2])

    def test_spend_with_evidence_and_refund(self):
        self.ledger.ingest(rec(record_id="r-1", source_message_id="m1", amount_decimal="20.00"))
        self.ledger.ingest(rec(record_id="r-2", source_message_id="m2", amount_decimal="10.00",
                               vendor="Anthropic"))
        self.ledger.ingest(rec(record_id="r-3", source_message_id="m3", amount_decimal="5.00",
                               kind="REFUND", direction="credit"))
        out = self.ledger.spend(since="2026-08-01", until="2026-10-01")
        usd = out["by_currency"]["USD"]
        self.assertAlmostEqual(usd["total"], 25.0)  # 20 + 10 - 5
        self.assertEqual(usd["count"], 3)
        self.assertTrue(all(e["source_message_id"] for e in usd["evidence"]))

    def test_recurring_detection(self):
        self.ledger.ingest(rec(record_id="r-1", source_message_id="m1",
                               tx_date="2026-08-05T00:00:00+00:00", amount_decimal="9.99",
                               vendor="Netflix", category="saas"))
        self.ledger.ingest(rec(record_id="r-2", source_message_id="m2",
                               tx_date="2026-09-05T00:00:00+00:00", amount_decimal="9.99",
                               vendor="Netflix", category="saas"))
        recs = self.ledger.recurring()
        self.assertEqual(len(recs), 1)
        self.assertEqual(recs[0]["vendor"], "Netflix")
        self.assertEqual(recs[0]["median_gap_days"], 31)

    def test_multi_currency_never_merged(self):
        self.ledger.ingest(rec(record_id="r-1", source_message_id="m1", currency="USD",
                               amount_decimal="10.00"))
        self.ledger.ingest(rec(record_id="r-2", source_message_id="m2", currency="EUR",
                               amount_decimal="10.00"))
        out = self.ledger.spend()
        self.assertAlmostEqual(out["by_currency"]["USD"]["total"], 10.0)
        self.assertAlmostEqual(out["by_currency"]["EUR"]["total"], 10.0)


class TestDates(unittest.TestCase):
    def test_parse_common_formats(self):
        self.assertEqual(parse_iso_date("2026-09-01"), "2026-09-01")
        self.assertEqual(parse_iso_date("1 Sep 2026"), "2026-09-01")
        self.assertEqual(parse_iso_date("September 1, 2026"), "2026-09-01")

    def test_garbage_raises(self):
        with self.assertRaises(LedgerError):
            parse_iso_date("tomorrow-ish")


if __name__ == "__main__":
    unittest.main(verbosity=2)
