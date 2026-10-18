import importlib.util
from pathlib import Path
import unittest

path = Path(__file__).resolve().parents[1] / 'skills/mermail-invoice-chaser/scripts/aging.py'
spec = importlib.util.spec_from_file_location('aging', path)
aging = importlib.util.module_from_spec(spec)
spec.loader.exec_module(aging)


def row(**changes):
    return dict(account='a', invoice_id='1', currency='USD', outstanding='0.10',
                owner_confirmed=True, direction='receivable', status='OPEN',
                due_date='2026-10-01', **changes) if not changes else {**row(), **changes}


class AgingTests(unittest.TestCase):
    def test_boundaries(self):
        for day, expected in [('2026-09-30', 'current'), ('2026-10-01', 'current'),
                              ('2026-10-02', 'early_overdue'), ('2026-10-08', 'reminder_review'),
                              ('2026-10-31', 'escalation_review')]:
            self.assertEqual(aging.project([row()], day)['rows'][0]['bucket'], expected)

    def test_decimal_currency(self):
        result = aging.project([row(), row(invoice_id='2', outstanding='0.20'),
                               row(account='b', currency='EUR', outstanding='5')], '2026-10-10')
        self.assertEqual(result['projected_totals_by_currency'], {'USD': '0.30', 'EUR': '5'})
        self.assertEqual(result['effects'], [])

    def test_unverified_and_payable(self):
        for changes in [{'owner_confirmed': False}, {'direction': 'payable'},
                        {'outstanding': 0.1}, {'outstanding': 'NaN'}, {'due_date': 'Friday'}]:
            self.assertEqual(aging.project([row(**changes)], '2026-10-10')['rows'][0]['state'], 'NEEDS-REVIEW')

    def test_paused_status(self):
        for state in ['DISPUTED', 'PROMISED', 'PAID-CANDIDATE', 'PAID', 'UNCERTAIN']:
            self.assertEqual(aging.project([row(status=state)], '2026-10-10')['rows'][0]['state'], 'NEEDS-REVIEW')

    def test_duplicate(self):
        result = aging.project([row(), row()], '2026-10-10')
        self.assertTrue(all(item['state'] == 'NEEDS-REVIEW' for item in result['rows']))
        self.assertEqual(result['projected_totals_by_currency'], {})
        result = aging.project([row(), row(outstanding='999')], '2026-10-10')
        self.assertEqual(result['projected_totals_by_currency'], {})

    def test_policy(self):
        self.assertEqual(aging.project([row()], '2026-10-04', (3, 10))['rows'][0]['bucket'], 'reminder_review')
        with self.assertRaises(ValueError):
            aging.project([row()], '2026-10-04', (10, 3))

    def test_large_exact_sum(self):
        amount = '9' * 60 + '.01'
        result = aging.project([row(outstanding=amount), row(invoice_id='2', outstanding='0.02')], '2026-10-10')
        self.assertEqual(result['projected_totals_by_currency']['USD'], '9' * 60 + '.03')

    def test_non_plain_decimal(self):
        for amount in ['1e100000', 'Infinity', '-1', '1,000', '1' * 1025, '1.' + '1' * 19]:
            self.assertEqual(aging.project([row(outstanding=amount)], '2026-10-10')['rows'][0]['state'], 'NEEDS-REVIEW')

    def test_trimmed_identity_still_duplicate(self):
        result = aging.project([row(), row(account=' a ', invoice_id=' 1 ')], '2026-10-10')
        self.assertEqual(result['projected_totals_by_currency'], {})

    def test_malformed_input(self):
        for rows in [[None], [row()] * 201]:
            with self.assertRaises(ValueError):
                aging.project(rows, '2026-10-10')
        for thresholds in [(True, 30), (7.5, 30), None]:
            with self.assertRaises(ValueError):
                aging.project([row()], '2026-10-10', thresholds)
        with self.assertRaises(ValueError):
            aging.project([row()], '2026-W41-6')


if __name__ == '__main__':
    unittest.main()
