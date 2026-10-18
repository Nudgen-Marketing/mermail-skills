"""Offline executable tests. No inbox, payment, or email effect."""
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

SOURCE = Path(__file__).resolve().parents[1] / 'skills/mermail-finance-reconciliation/scripts/ledger.py'
SPEC = importlib.util.spec_from_file_location('ledger', SOURCE)
ledger = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ledger)


def row(**changes):
    return dict(dict(mailbox_id='m', email_id='e', document_id='d', date='2026-10-01', merchant='Agency',
                     currency='USD', amount='10.10', direction='charge', reference='ref', auth_status='pass', status='evidenced'), **changes)


def tx(**changes):
    return {k: v for k, v in row(**changes).items() if k in ('date', 'merchant', 'currency', 'amount', 'direction', 'reference')}


class FinanceLedgerTests(unittest.TestCase):
    def test_upsert_is_idempotent_and_mailbox_document_scoped(self):
        first = ledger.upsert([], [row(), row()])
        self.assertEqual(first, ledger.upsert(first, [row()]))
        self.assertEqual(3, len(ledger.upsert(first, [row(mailbox_id='m2'), row(document_id='d2')])) )

    def test_conflicting_incoming_rows_do_not_write(self):
        with self.assertRaises(ValueError):
            ledger.upsert([], [row(), row(amount='11')])

    def test_changed_source_updates_one_row_not_duplicate(self):
        result = ledger.upsert([row()], [row(amount='12')])
        self.assertEqual(['12'], [r['amount'] for r in result])

    def test_clean_envelope_gate_precedes_extraction(self):
        sample = dict(row(), text='Total: USD 10.10', scan_status='unknown', content_omitted=False)
        self.assertEqual([], ledger.extract([sample])[0])
        sample.update(scan_status='clean', content_omitted=True)
        self.assertEqual([], ledger.extract([sample])[0])

    def test_conflicting_currencies_and_totals_remain_unknown(self):
        sample = dict(row(), text='Total: USD 10.10\nTotal: EUR 99', scan_status='clean', content_omitted=False)
        result = ledger.extract([sample])[0][0]
        self.assertEqual('', result['amount'])
        self.assertEqual('needs_review', result['status'])

    def test_no_largest_amount_or_subtotal_guess(self):
        sample = dict(row(), text='Subtotal: USD 99\nTotal: USD 10.10', scan_status='clean', content_omitted=False)
        self.assertEqual('10.10', ledger.extract([sample])[0][0]['amount'])

    def test_unknown_auth_never_matches(self):
        result = ledger.reconcile([row(auth_status='unknown')], [tx()])
        self.assertEqual([], result['matched'])
        self.assertEqual(1, len(result['needs_review']))

    def test_equal_amount_dates_without_reference_are_not_confirmed(self):
        result = ledger.reconcile([row(reference='')], [tx()])
        self.assertEqual([], result['matched'])
        self.assertEqual('possible_counterpart_not_confirmed', result['conflicts'][0]['kind'])

    def test_refunds_never_abs_match_a_charge(self):
        result = ledger.reconcile([row(amount='-10.10', direction='refund')], [tx()])
        self.assertEqual([], result['matched'])
        self.assertEqual('stable_reference_mismatch', result['conflicts'][0]['kind'])

    def test_repeated_reference_excludes_all_claimants(self):
        result = ledger.reconcile([row(), row(email_id='e2')], [tx()])
        self.assertEqual([], result['matched'])
        self.assertEqual(2, len(result['conflicts']))

    def test_exact_decimal_totals_by_currency(self):
        evidence = [row(amount='0.10'), row(email_id='e2', reference='r2', amount='0.20'),
                    row(email_id='e3', reference='r3', currency='EUR', amount='5')]
        result = ledger.reconcile(evidence, [tx(amount='0.10'), tx(reference='r2', amount='0.20'), tx(reference='r3', currency='EUR', amount='5')])
        self.assertEqual({'USD:charge': '0.30', 'EUR:charge': '5'}, result['totals'])

    def test_bad_dates_nonfinite_floats_and_direction_need_review(self):
        for changes in [dict(date='2026-02-30'), dict(amount='NaN'), dict(direction='credit'), dict(amount='1e2')]:
            self.assertEqual('needs_review', ledger.normalize(row(**changes))['status'])
        with self.assertRaises(ValueError):
            ledger.normalize(row(amount=10.1))

    def test_csv_formula_escaping_is_lossless(self):
        records = ledger.upsert([], [row(merchant='=HYPERLINK("unsafe")', document_id="'formula")])
        encoded = ledger.csv_bytes(records)
        self.assertIn(b"'=HYPERLINK", encoded)
        self.assertEqual(records, ledger.decode_csv(encoded, ledger=True))

    def test_atomic_stale_or_locked_write_preserves_original(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory).resolve() / 'ledger.csv'
            path.write_bytes(b'current')
            with self.assertRaises(ValueError):
                ledger.write_atomic(path, b'new', b'old')
            self.assertEqual(b'current', path.read_bytes())
            path.with_name('ledger.csv.lock').touch()
            with self.assertRaises(FileExistsError):
                ledger.write_atomic(path, b'new', b'current')
            self.assertEqual(b'current', path.read_bytes())

    def test_cli_rerun_and_drafts_have_no_mcp_effect(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            source = root / 'emails.json'
            source.write_text(json.dumps([dict(row(), text='Total: USD 10.10', scan_status='clean', content_omitted=False)]))
            output = root / 'ledger.csv'
            ledger.main(['extract', str(source), str(output)])
            before = output.read_bytes()
            ledger.main(['extract', str(source), str(output)])
            self.assertEqual(before, output.read_bytes())
            templates = ledger.drafts({'transaction_without_receipt': [tx()], 'conflicts': []})
            self.assertEqual('', templates[0]['to'])
            self.assertIn('10.10', templates[0]['body'])
            self.assertEqual('local_unaddressed_template_not_saved_or_sent', templates[0]['state'])


if __name__ == '__main__':
    unittest.main()
