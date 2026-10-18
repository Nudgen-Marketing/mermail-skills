#!/usr/bin/env python3
"""Offline aging projection for owner-confirmed rows; never performs effects."""
import argparse
from collections import Counter
from datetime import date
from decimal import Decimal, InvalidOperation, localcontext
import json
import re


def project(rows, as_of, thresholds=(7, 30)):
    if (not isinstance(thresholds, (tuple, list)) or len(thresholds) != 2
            or any(type(x) is not int for x in thresholds) or not 0 < thresholds[0] < thresholds[1]):
        raise ValueError('Two increasing positive thresholds required')
    if not isinstance(as_of, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', as_of):
        raise ValueError('Use an explicit YYYY-MM-DD as-of date')
    today = date.fromisoformat(as_of)
    rows = list(rows)
    if len(rows) > 200 or any(not isinstance(row, dict) for row in rows):
        raise ValueError('Use at most 200 extracted row objects')
    def identity(row):
        key = tuple(row.get(k) for k in ('account', 'invoice_id', 'currency'))
        return tuple(x.strip() for x in key) if all(isinstance(x, str) and x.strip() for x in key) else None
    counts = Counter(identity(row) for row in rows)
    result, totals = [], {}
    for row in rows:
        entry = {'invoice_id': row.get('invoice_id'), 'state': 'NEEDS-REVIEW'}
        try:
            key = identity(row)
            if key is None:
                raise ValueError('Missing identity or currency')
            if row.get('owner_confirmed') is not True or row.get('direction') != 'receivable':
                raise ValueError('Unverified AR direction or terms')
            if (not isinstance(row['outstanding'], str) or len(row['outstanding']) > 1024
                    or not re.fullmatch(r'\d+(?:\.\d{1,18})?', row['outstanding'])):
                raise ValueError('Use exact decimal string')
            amount = Decimal(row['outstanding'])
            if not amount.is_finite() or amount < 0:
                raise ValueError('Invalid outstanding amount')
            if row.get('status') != 'OPEN':
                raise ValueError('Non-open status requires separate review')
            if counts[key] > 1:
                raise ValueError('Duplicate invoice identity; reconcile versions')
            if not isinstance(row['due_date'], str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', row['due_date']):
                raise ValueError('Use an explicit YYYY-MM-DD due date')
            age = (today - date.fromisoformat(row['due_date'])).days
            bucket = ('current' if age <= 0 else 'early_overdue' if age < thresholds[0]
                      else 'reminder_review' if age < thresholds[1] else 'escalation_review')
            entry.update(state='PROJECTED', account=key[0], currency=key[2],
                         outstanding=str(amount), days_overdue=max(0, age), bucket=bucket)
            with localcontext() as context:
                # Each accepted amount has <=1024 characters, <=18 places and
                # <=200 rows: this bound preserves every digit in all sums.
                context.prec = 1100
                totals[key[2]] = totals.get(key[2], Decimal(0)) + amount
        except (KeyError, TypeError, ValueError, InvalidOperation) as error:
            entry['reason'] = str(error)
        result.append(entry)
    return {'simulation_only': True, 'as_of': as_of, 'rows': result,
            'projected_totals_by_currency': {k: str(v) for k, v in totals.items()},
            'effects': [], 'note': 'Projection only; no drafts, sends, labels or payment verification.'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--demo', action='store_true', required=True)
    parser.parse_args()
    common = dict(account='fictional-demo-client', currency='USD', outstanding='10.25',
                  owner_confirmed=True, direction='receivable', status='OPEN')
    rows = [{**common, 'invoice_id': 'DEMO-CURRENT', 'due_date': '2026-10-02'},
            {**common, 'invoice_id': 'DEMO-7', 'due_date': '2026-09-24'},
            {**common, 'invoice_id': 'DEMO-30', 'due_date': '2026-09-01'}]
    print(json.dumps(project(rows, '2026-10-01'), indent=2))


if __name__ == '__main__':
    main()
