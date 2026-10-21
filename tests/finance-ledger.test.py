"""Offline executable tests. No inbox, payment, or email effect."""
import importlib.util
import csv
import copy
import io
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SOURCE = Path(__file__).resolve().parents[1] / 'skills/mermail-finance-reconciliation/scripts/ledger.py'
SPEC = importlib.util.spec_from_file_location('ledger', SOURCE)
ledger = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ledger)


SCOPE = ("w", "m")


def upsert(existing, incoming):
    return ledger.upsert(existing, incoming, SCOPE)


def extract(emails):
    return ledger.extract(emails, SCOPE)


def reconcile(evidence, transactions):
    return ledger.reconcile(evidence, transactions, SCOPE)


def drafts(report):
    return ledger.drafts(dict(report, workspace_id="w", mailbox_id="m"), SCOPE)


def row(**changes):
    return dict(dict(workspace_id='w', mailbox_id='m', email_id='e', document_id='d', date='2026-10-01', merchant='Agency',
                     currency='USD', amount='10.10', direction='charge', reference='ref', auth_status='pass', status='evidenced'), **changes)


def tx(**changes):
    return {k: v for k, v in row(**changes).items() if k in ('date', 'merchant', 'currency', 'amount', 'direction', 'reference')}


class FinanceLedgerTests(unittest.TestCase):
    def test_explicit_scope_rejects_other_mailbox_or_workspace(self):
        for changes in [dict(workspace_id='other'), dict(mailbox_id='other')]:
            foreign = row(**changes)
            with self.assertRaises(ValueError):
                upsert([], [foreign])
            with self.assertRaises(ValueError):
                reconcile([foreign], [tx()])
            with self.assertRaises(ValueError):
                extract([dict(foreign, text='Total: USD 10.10', scan_status='clean', content_omitted=False)])

    def test_draft_report_scope_must_match_selected_scope(self):
        with self.assertRaises(ValueError):
            ledger.drafts({'workspace_id': 'w', 'mailbox_id': 'other', 'transaction_without_receipt': [tx()]}, SCOPE)
        with self.assertRaises(ValueError):
            ledger.main(['extract', 'input.json', 'output.csv'])

    def test_upsert_is_idempotent_and_mailbox_document_scoped(self):
        first = upsert([], [row(), row()])
        self.assertEqual(first, upsert(first, [row()]))
        self.assertEqual(2, len(upsert(first, [row(document_id='d2')])))

    def test_conflicting_incoming_rows_do_not_write(self):
        with self.assertRaises(ValueError):
            upsert([], [row(), row(amount='11')])

    def test_changed_source_updates_one_row_not_duplicate(self):
        result = upsert([row()], [row(amount='12')])
        self.assertEqual(['12'], [r['amount'] for r in result])

    def test_clean_envelope_gate_precedes_extraction(self):
        sample = dict(row(), text='Total: USD 10.10', scan_status='unknown', content_omitted=False)
        self.assertEqual([], extract([sample])[0])
        sample.update(scan_status='clean', content_omitted=True)
        self.assertEqual([], extract([sample])[0])

    def test_conflicting_currencies_and_totals_remain_unknown(self):
        sample = dict(row(), text='Total: USD 10.10\nTotal: EUR 99', scan_status='clean', content_omitted=False)
        result = extract([sample])[0][0]
        self.assertEqual('', result['amount'])
        self.assertEqual('needs_review', result['status'])

    def test_no_largest_amount_or_subtotal_guess(self):
        sample = dict(row(), text='Subtotal: USD 99\nTotal: USD 10.10', scan_status='clean', content_omitted=False)
        self.assertEqual('10.10', extract([sample])[0][0]['amount'])

    def test_unknown_auth_never_matches(self):
        result = reconcile([row(auth_status='unknown')], [tx()])
        self.assertEqual([], result['matched'])
        self.assertEqual(1, len(result['needs_review']))

    def test_equal_amount_dates_without_reference_are_not_confirmed(self):
        result = reconcile([row(reference='')], [tx()])
        self.assertEqual([], result['matched'])
        self.assertEqual('possible_counterpart_not_confirmed', result['conflicts'][0]['kind'])

    def test_refunds_never_abs_match_a_charge(self):
        result = reconcile([row(amount='-10.10', direction='refund')], [tx()])
        self.assertEqual([], result['matched'])
        self.assertEqual('stable_reference_mismatch', result['conflicts'][0]['kind'])

    def test_repeated_reference_excludes_all_claimants(self):
        result = reconcile([row(), row(email_id='e2')], [tx()])
        self.assertEqual([], result['matched'])
        self.assertEqual(2, len(result['conflicts']))

    def test_exact_decimal_totals_by_currency(self):
        evidence = [row(amount='0.10'), row(email_id='e2', reference='r2', amount='0.20'),
                    row(email_id='e3', reference='r3', currency='EUR', amount='5')]
        result = reconcile(evidence, [tx(amount='0.10'), tx(reference='r2', amount='0.20'), tx(reference='r3', currency='EUR', amount='5')])
        self.assertEqual({'USD:charge': '0.30', 'EUR:charge': '5'}, result['totals'])

    def test_bad_dates_nonfinite_floats_and_direction_need_review(self):
        for changes in [dict(date='2026-02-30'), dict(amount='NaN'), dict(direction='credit'), dict(amount='1e2')]:
            self.assertEqual('needs_review', ledger.normalize(row(**changes))['status'])
        with self.assertRaises(ValueError):
            ledger.normalize(row(amount=10.1))

    def test_csv_formula_escaping_is_lossless(self):
        records = upsert([], [row(merchant='=HYPERLINK("unsafe")', document_id="'formula")])
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
            ledger.main(['extract', 'w', 'm', str(source), str(output)])
            before = output.read_bytes()
            ledger.main(['extract', 'w', 'm', str(source), str(output)])
            self.assertEqual(before, output.read_bytes())
            templates = drafts({'transaction_without_receipt': [tx()], 'conflicts': []})
            self.assertEqual('', templates[0]['to'])
            self.assertIn('10.10', templates[0]['body'])
            self.assertEqual('local_unaddressed_template_not_saved_or_sent', templates[0]['state'])


class FinanceOutputBoundaryTests(unittest.TestCase):
    def cli(self, *args):
        return subprocess.run([sys.executable, '-B', str(SOURCE), *map(str, args)],
                              capture_output=True, text=True,
                              env={**os.environ, 'PYTHONDONTWRITEBYTECODE': '1'})

    def test_full_300_by_300_ambiguity_cli_reopens_and_drafts(self):
        evidence = [row(email_id=f'email-{i}', document_id=f'document-{i}', reference='')
                    for i in range(ledger.MAX_ROWS)]
        transactions = [tx(reference=f'statement-{i}') for i in range(ledger.MAX_ROWS)]
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            source, baseline, report_path, draft_path = [root / name for name in
                                                        ('ledger.csv', 'transactions.csv', 'report.json', 'drafts.json')]
            source.write_bytes(ledger.csv_bytes(evidence))
            buf = io.StringIO(newline='')
            writer = csv.DictWriter(buf, fieldnames=list(transactions[0]))
            writer.writeheader()
            writer.writerows(transactions)
            baseline.write_text(buf.getvalue())
            result = self.cli('reconcile', 'w', 'm', source, baseline, report_path)
            self.assertEqual(0, result.returncode, result.stderr)
            content = ledger.read_bytes(report_path)
            self.assertLessEqual(len(content), ledger.MAX_BYTES)
            report = json.loads(content)
            self.assertEqual([], report['matched'])
            self.assertEqual({}, report['totals'])
            self.assertEqual(300, len(report['receipt_without_transaction']))
            self.assertEqual(300, len(report['transaction_without_receipt']))
            self.assertEqual(300, len(report['transactions']))
            self.assertEqual(300, len(report['conflicts']))
            self.assertEqual(90000, sum(c['candidate_count'] for c in report['conflicts']))
            for conflict in report['conflicts']:
                self.assertEqual(list(range(300)), conflict['candidate_transaction_indices'])
                self.assertEqual(set(t['reference'] for t in transactions),
                                 {report['transactions'][i]['reference']
                                  for i in conflict['candidate_transaction_indices']})
                self.assertNotIn('candidates', conflict)
            result = self.cli('drafts', 'w', 'm', report_path, draft_path)
            self.assertEqual(0, result.returncode, result.stderr)
            templates = json.loads(ledger.read_bytes(draft_path))
            self.assertEqual(50, len(templates))
            for template in templates[25:]:
                self.assertEqual(300, len(template['evidence']['candidate_references']))
                self.assertNotIn('candidate_transaction_indices', template['evidence'])
                self.assertEqual('', template['to'])

    def test_oversized_serialization_and_direct_write_preserve_existing_artifact(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            existing = root / 'drafts.json'
            original = b'{"operator_edit":"preserve me"}'
            existing.write_bytes(original)
            with self.assertRaisesRegex(ValueError, 'Output exceeds'):
                ledger.write_atomic(existing, b'x' * (ledger.MAX_BYTES + 1), original)
            self.assertEqual(original, existing.read_bytes())
            # A legacy inline-candidate report fits the reader in UTF-8, while
            # expanded ASCII-escaped JSON templates would exceed the same limit.
            transactions = [tx(reference=f'{i}-' + '\U0001f642' * 150,
                               merchant='\U0001f642' * 160) for i in range(300)]
            report = {'workspace_id': 'w', 'mailbox_id': 'm',
                      'transaction_without_receipt': [],
                      'conflicts': [{'kind': 'possible_counterpart_not_confirmed',
                                     'evidence': row(email_id=f'e-{i}'),
                                     'candidates': transactions} for i in range(10)]}
            source = root / 'legacy-report.json'
            source.write_text(json.dumps(report, ensure_ascii=False), encoding='utf-8')
            self.assertLess(len(ledger.read_bytes(source)), ledger.MAX_BYTES)
            result = self.cli('drafts', 'w', 'm', source, existing)
            self.assertEqual(1, result.returncode)
            self.assertIn('Output exceeds 8 MiB', result.stderr)
            self.assertEqual(original, existing.read_bytes())
            self.assertFalse(existing.with_name(existing.name + '.lock').exists())
            self.assertEqual({'legacy-report.json', 'drafts.json'}, {p.name for p in root.iterdir()})

    def test_cumulative_link_budget_fails_without_partial_result(self):
        before = ledger.MAX_CANDIDATE_LINKS
        try:
            ledger.MAX_CANDIDATE_LINKS = 3
            with self.assertRaisesRegex(ValueError, 'Candidate link budget'):
                reconcile([row(reference=''), row(email_id='e2', reference='')],
                          [tx(reference='one'), tx(reference='two')])
        finally:
            ledger.MAX_CANDIDATE_LINKS = before

    def test_dangling_or_invalid_candidate_indices_are_not_drafted(self):
        for indices in [[300], [-1], [True], ['0'], list(range(301))]:
            with self.subTest(indices=indices[:2]):
                with self.assertRaisesRegex(ValueError, 'Invalid candidate'):
                    drafts({'transactions': [tx()], 'transaction_without_receipt': [],
                            'conflicts': [{'kind': 'possible_counterpart_not_confirmed',
                                           'evidence': row(), 'candidate_transaction_indices': indices}]})

    def test_new_candidate_schema_cli_errors_preserve_existing_artifact(self):
        report = reconcile([row(reference='')], [tx(reference='first'), tx(reference='second')])
        cases = []
        for count in [0, '2', None, True, -1, 2.0, 300]:
            value = copy.deepcopy(report)
            value['conflicts'][0]['candidate_count'] = count
            cases.append((f'count-{count!r}', value))
        value = copy.deepcopy(report)
        value['conflicts'][0].pop('candidate_count')
        cases.append(('missing-count', value))
        for indices, count in [([0, 0], 2), ([], 300), ([True], 1), (['0'], 1), ([2], 1), ([-1], 1)]:
            value = copy.deepcopy(report)
            value['conflicts'][0].update(candidate_transaction_indices=indices, candidate_count=count)
            cases.append((f'indices-{indices!r}', value))
        value = copy.deepcopy(report)
        value['conflicts'][0].pop('candidate_transaction_indices')
        cases.append(('missing-indices', value))
        value = copy.deepcopy(report)
        value['conflicts'][0]['kind'] = 'stable_reference_mismatch'
        cases.append(('wrong-kind', value))
        value = copy.deepcopy(report)
        value['conflicts'][0]['candidates'] = value['transactions']
        cases.append(('mixed-representations', value))
        for reference in ['', '   ', 'first', None, 123, 'x' * 161, 'line\nbreak']:
            value = copy.deepcopy(report)
            # Even an unselected registry row must have a valid unique reference.
            value['conflicts'][0].update(candidate_transaction_indices=[0], candidate_count=1)
            value['transactions'][1]['reference'] = reference
            cases.append((f'registry-{reference!r}', value))
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            source, output = root / 'report.json', root / 'drafts.json'
            original = b'{"operator_edit":"do not replace"}'
            output.write_bytes(original)
            for name, malformed in cases:
                with self.subTest(case=name):
                    source.write_text(json.dumps(malformed), encoding='utf-8')
                    result = self.cli('drafts', 'w', 'm', source, output)
                    self.assertEqual(1, result.returncode, result.stdout)
                    self.assertTrue(result.stderr)
                    self.assertEqual(original, output.read_bytes())
                    self.assertEqual({'report.json', 'drafts.json'}, {p.name for p in root.iterdir()})

    def test_new_schema_beyond_template_cap_is_still_validated(self):
        report = reconcile([row(reference='')], [tx()])
        report['conflicts'] = [copy.deepcopy(report['conflicts'][0]) for _ in range(26)]
        report['conflicts'][-1]['candidate_count'] = 0
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            source, output = root / 'report.json', root / 'drafts.json'
            source.write_text(json.dumps(report))
            output.write_bytes(b'preserved')
            result = self.cli('drafts', 'w', 'm', source, output)
            self.assertEqual(1, result.returncode)
            self.assertEqual(b'preserved', output.read_bytes())
            self.assertFalse(output.with_name(output.name + '.lock').exists())

    def test_legacy_inline_candidate_report_cli_remains_compatible(self):
        report = reconcile([row(reference='')], [tx(reference='first'), tx(reference='second')])
        conflict = report['conflicts'][0]
        conflict['candidates'] = report.pop('transactions')
        conflict.pop('candidate_transaction_indices')
        conflict.pop('candidate_count')
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            source, output = root / 'report.json', root / 'drafts.json'
            source.write_text(json.dumps(report))
            result = self.cli('drafts', 'w', 'm', source, output)
            self.assertEqual(0, result.returncode, result.stderr)
            templates = json.loads(ledger.read_bytes(output))
            self.assertEqual(conflict['candidates'], templates[-1]['evidence']['candidates'])
            self.assertEqual('', templates[-1]['to'])


if __name__ == '__main__':
    unittest.main()
