import csv
import importlib.util
import io
from pathlib import Path
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'skills/mermail-csv-review-agent/scripts/review_csv.py'
SPEC = importlib.util.spec_from_file_location('csv_review', SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class CsvReviewTests(unittest.TestCase):
    def setUp(self):
        self.policy = {'columns': ['id', 'name'], 'required': ['id', 'name'], 'trim': ['id', 'name'], 'unique_key': ['id']}

    def test_leading_zeros_and_only_explicit_trims(self):
        result = MODULE.review(b'id,name\r\n001, Ada \r\n', self.policy)
        self.assertEqual(result['accepted'][0]['candidate'], {'id': '001', 'name': 'Ada'})
        self.assertEqual(result['changes'], [{'input_record': 2, 'column': 'name', 'before': ' Ada ', 'after': 'Ada'}])
        self.assertEqual(result['status'], 'validated')

    def test_all_duplicate_members_held_even_with_other_violation(self):
        result = MODULE.review(b'id,name\n01,First\n 01 ,\n02,Third\n', self.policy)
        self.assertEqual(result['candidate_records'], 1)
        self.assertEqual([r['input_record'] for r in result['held']], [2, 3])
        self.assertEqual(result['issue_counts']['duplicate_key'], 2)
        self.assertEqual(result['issue_counts']['missing_required'], 1)
        self.assertEqual(result['input_records'], result['candidate_records'] + result['held_records'])

    def test_malformed_structure_stops_and_does_not_guess_header(self):
        with self.assertRaises(csv.Error):
            MODULE.review(b'id,name\n1,"unfinished', self.policy)
        with self.assertRaisesRegex(ValueError, 'header'):
            MODULE.review(b'name,id\nAda,1\n', self.policy)
        with self.assertRaisesRegex(ValueError, 'Unknown policy'):
            MODULE.review(b'id,name\n1,Ada\n', dict(self.policy, trimm=['name']))

    def test_quoted_multiline_and_formula_cells(self):
        source = io.StringIO(newline='')
        writer = csv.writer(source)
        writer.writerow(['id', 'name'])
        writer.writerow(['1', 'Name, with\nnew line'])
        writer.writerow(['2', '=HYPERLINK("https://example.test","click")'])
        result = MODULE.review(source.getvalue().encode(), self.policy)
        self.assertEqual(result['candidate_records'], 1)
        self.assertEqual(result['accepted'][0]['candidate']['name'], 'Name, with\nnew line')
        self.assertEqual(result['held'][0]['issues'][0]['code'], 'spreadsheet_formula_like')
        self.assertTrue(result['held'][0]['original'][1].startswith('=HYPERLINK'))

    def test_wrong_field_count_and_enum_do_not_disappear(self):
        policy = dict(self.policy, allowed_values={'name': ['Ada']})
        result = MODULE.review(b'id,name\n1,Ada,extra\n2,Bea\n3,Ada\n', policy)
        self.assertEqual(result['input_records'], 3)
        self.assertEqual(result['held_records'], 2)
        self.assertEqual(result['candidate_records'], 1)
        self.assertEqual(result['issue_counts'], {'field_count': 1, 'not_allowed': 1})


if __name__ == '__main__':
    unittest.main()
