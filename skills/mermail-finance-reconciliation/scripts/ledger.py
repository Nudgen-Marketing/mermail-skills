#!/usr/bin/env python3
"""Offline, bounded evidence ledger; never calls Mermail or authorizes an effect.

Adapted from gmDevi's expense-ledger contribution (PR #202), MIT.
extract emails.json ledger.csv
reconcile ledger.csv transactions.csv report.json
drafts report.json drafts.json
Each output is an explicitly selected local artifact, not a sent/saved MCP draft.
"""
import csv
import io
import json
import os
import re
import stat
import sys
import tempfile
from datetime import date
from decimal import Decimal, localcontext
from pathlib import Path

MAX_BYTES = 8 * 1024 * 1024
MAX_ROWS = 300
FIELDS = ['mailbox_id', 'email_id', 'document_id', 'date', 'merchant', 'currency',
          'amount', 'direction', 'reference', 'auth_status', 'status']
AMOUNT = re.compile(r'-?(?:0|[1-9]\d{0,127})(?:\.\d{1,18})?\Z')
# Explicit ISO codes only. Symbols and ambiguous/grouped totals need human review.
TOTAL = re.compile(r'(?im)^\s*(?:grand total|total|amount paid|amount due)\s*:\s*'
                   r'([A-Z]{3,8})\s+(-?(?:0|[1-9]\d*)(?:\.\d{1,18})?)\s*$')


def number(value):
    if not isinstance(value, str) or not AMOUNT.fullmatch(value):
        raise ValueError('Use bounded plain decimal strings, never floats or currency symbols')
    return Decimal(value)


def day(value):
    if not isinstance(value, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', value):
        raise ValueError('Use explicit YYYY-MM-DD dates')
    return date.fromisoformat(value)


def text(value, limit=160):
    if not isinstance(value, str) or len(value) > limit or any(ord(c) < 32 for c in value):
        raise ValueError('Invalid bounded evidence field')
    return value.strip()


def rows(value):
    if not isinstance(value, list) or len(value) > MAX_ROWS or any(not isinstance(x, dict) for x in value):
        raise ValueError('Expected at most 300 object rows')
    return value


def identity(row):
    key = tuple(text(row.get(k, '')) for k in ('mailbox_id', 'email_id', 'document_id'))
    if not all(key):
        raise ValueError('mailbox_id, email_id and document_id are required')
    return key


def normalize(row):
    result = {k: text(row.get(k, '')) for k in FIELDS}
    identity(result)
    if result['currency'] and not re.fullmatch(r'[A-Z]{3,8}', result['currency']):
        raise ValueError('Explicit currency code required')
    valid = True
    try:
        day(result['date'])
        amount = number(result['amount'])
        valid = ((result['direction'] == 'charge' and amount >= 0)
                 or (result['direction'] == 'refund' and amount < 0))
    except ValueError:
        valid = False
    result['status'] = ('evidenced' if valid and result['merchant'] and result['currency']
                        and result['auth_status'] == 'pass' and row.get('status') != 'needs_review'
                        else 'needs_review')
    return result


def extract(emails):
    output, skipped = [], []
    for source in rows(emails):
        key = identity(source)
        if (source.get('scan_status') != 'clean' or source.get('content_omitted') is not False
                or not isinstance(source.get('text'), str) or len(source['text']) > 10000):
            skipped.append(list(key))
            continue
        # The clean flag must come from a verified tool envelope, not email JSON text.
        candidates = sorted(set(TOTAL.findall(source['text'])))
        row = {k: source.get(k, '') for k in FIELDS}
        row['currency'] = row['amount'] = ''
        row['status'] = 'needs_review'
        if len(candidates) == 1:
            row['currency'], row['amount'] = candidates[0]
            row['status'] = 'evidenced'
        # Never prefer the largest amount, guessed sender, forwarded date or a substring.
        output.append(normalize(row))
    return output, skipped


def upsert(existing, incoming):
    records = {}
    for row in rows(existing):
        key = identity(row)
        if key in records:
            raise ValueError('Existing ledger has duplicate evidence identity; review before writing')
        records[key] = normalize(row)
    additions = {}
    for row in rows(incoming):
        key = identity(row)
        value = normalize(row)
        if key in additions and additions[key] != value:
            raise ValueError('Conflicting incoming rows for one evidence identity')
        additions[key] = value
    records.update(additions)
    if len(records) > MAX_ROWS:
        raise ValueError('Ledger exceeds bounded row budget; choose a narrower artifact')
    return [records[k] for k in sorted(records)]


def reconcile(ledger, transactions):
    ledger = upsert(ledger, [])
    transactions = rows(transactions)
    txs = []
    refs = set()
    for item in transactions:
        tx = {k: text(item.get(k, '')) for k in ('date', 'merchant', 'currency', 'amount', 'direction', 'reference')}
        # The user must normalize the export's debit/credit convention, not abs(amount).
        normalized = normalize(dict(tx, mailbox_id='baseline', email_id='baseline', document_id=tx['reference'], auth_status='pass'))
        if not tx['reference'] or tx['reference'] in refs or normalized['status'] != 'evidenced':
            raise ValueError('Baseline references must be unique and rows complete under the selected sign convention')
        refs.add(tx['reference'])
        txs.append(tx)
    result = {'matched': [], 'receipt_without_transaction': [], 'transaction_without_receipt': [],
              'conflicts': [], 'needs_review': [], 'totals': {}, 'scope': 'reviewed local artifacts only'}
    used = set()
    claims = {}
    for row in ledger:
        if row['reference']:
            claims.setdefault(row['reference'], []).append(row)
    with localcontext() as context:
        context.prec = 512
        for row in ledger:
            if row['status'] != 'evidenced':
                result['needs_review'].append(row)
                continue
            candidates = [t for t in txs if row['reference'] and t['reference'] == row['reference']]
            if len(claims.get(row['reference'], [])) > 1:
                result['conflicts'].append({'kind': 'repeated_reference', 'evidence': row})
            elif candidates:
                tx = candidates[0]
                equal = (row['merchant'].casefold() == tx['merchant'].casefold()
                         and row['currency'] == tx['currency'] and row['direction'] == tx['direction']
                         and number(row['amount']) == number(tx['amount']) and row['date'] == tx['date'])
                if equal:
                    result['matched'].append({'evidence': row, 'transaction': tx})
                    used.add(tx['reference'])
                    group = row['currency'] + ':' + row['direction']
                    result['totals'][group] = format(Decimal(result['totals'].get(group, '0')) + number(row['amount']), 'f')
                else:
                    result['conflicts'].append({'kind': 'stable_reference_mismatch', 'evidence': row, 'transaction': tx})
            else:
                result['receipt_without_transaction'].append(row)
                near = [t for t in txs if row['merchant'].casefold() == t['merchant'].casefold()
                        and row['currency'] == t['currency'] and row['direction'] == t['direction']
                        and abs((day(row['date']) - day(t['date'])).days) <= 3]
                if near:
                    result['conflicts'].append({'kind': 'possible_counterpart_not_confirmed', 'evidence': row, 'candidates': near})
        result['transaction_without_receipt'] = [t for t in txs if t['reference'] not in used]
    return result


def drafts(report):
    # Structured report, not regex parsing of untrusted Markdown. No inferred recipient.
    if not isinstance(report, dict):
        raise ValueError('Expected structured reconciliation report')
    output = []
    for tx in rows(report.get('transaction_without_receipt', []))[:25]:
        output.append({'kind': 'receipt_request', 'to': '', 'subject': 'Receipt request for review',
                       'body': f"Hello, could you provide a receipt for the {text(tx.get('currency', ''))} "
                               f"{text(tx.get('amount', ''))} entry dated {text(tx.get('date', ''))} "
                               f"(statement reference {text(tx.get('reference', ''))})? Thank you.",
                       'evidence': tx, 'state': 'local_unaddressed_template_not_saved_or_sent'})
    for conflict in rows(report.get('conflicts', []))[:25]:
        output.append({'kind': 'discrepancy', 'to': '', 'subject': 'Reconciliation question for review',
                       'body': 'My reviewed records have a possible discrepancy. Please review the attached evidence before contacting a vendor.',
                       'evidence': conflict, 'state': 'local_unaddressed_template_not_saved_or_sent'})
    return output


def read_bytes(path, missing=False):
    path = Path(path)
    if any(p.is_symlink() for p in (path, *path.absolute().parents)):
        raise ValueError('Symlink artifact paths are not supported')
    if missing and not path.exists():
        return b''
    with path.open('rb') as handle:
        if not stat.S_ISREG(os.fstat(handle.fileno()).st_mode):
            raise ValueError('Only regular local files are supported')
        content = handle.read(MAX_BYTES + 1)
    if len(content) > MAX_BYTES:
        raise ValueError('Artifact exceeds 8 MiB')
    return content


def decode_csv(content, ledger=False):
    result = rows(list(csv.DictReader(io.StringIO(content.decode('utf-8'))))) if content else []
    if ledger:
        # Our ledger format prefixes every nonempty value, including amounts, with
        # one apostrophe. This is reversible and prevents spreadsheet formulas.
        for row in result:
            if set(row) != set(FIELDS) or any(v and not v.startswith("'") for v in row.values()):
                raise ValueError('Expected helper-format ledger; review/import other CSV explicitly')
            for key, value in row.items():
                row[key] = value[1:] if value else ''
    return result


def csv_bytes(records):
    buf = io.StringIO(newline='')
    writer = csv.DictWriter(buf, fieldnames=FIELDS)
    writer.writeheader()
    writer.writerows({key: "'" + value if value else '' for key, value in row.items()} for row in records)
    return buf.getvalue().encode('utf-8')


def write_atomic(path, content, expected):
    path = Path(path).absolute()
    if any(p.is_symlink() for p in (path, *path.parents)):
        raise ValueError('Symlink output paths are not supported')
    lock = path.with_name(path.name + '.lock')
    fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    temporary = None
    try:
        os.close(fd)
        if read_bytes(path, missing=True) != expected:
            raise ValueError('Artifact changed since read; no overwrite')
        with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as handle:
            temporary = Path(handle.name)
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
        temporary = None
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
        lock.unlink()


def main(args):
    if not args or args[0] not in ('extract', 'reconcile', 'drafts'):
        raise ValueError(__doc__)
    command, *paths = args
    expected_lengths = {'extract': 2, 'reconcile': 3, 'drafts': 2}
    if len(paths) != expected_lengths[command]:
        raise ValueError(__doc__)
    output = paths[-1]
    if Path(output).absolute() in [Path(p).absolute() for p in paths[:-1]]:
        raise ValueError('Input and output paths must differ')
    before = read_bytes(output, missing=True)
    if command == 'extract':
        incoming, skipped = extract(json.loads(read_bytes(paths[0])))
        data = csv_bytes(upsert(decode_csv(before, ledger=True), incoming))
        print(json.dumps({'skipped_evidence_ids': skipped, 'local_only': True}))
    elif command == 'reconcile':
        data = json.dumps(reconcile(decode_csv(read_bytes(paths[0]), ledger=True), decode_csv(read_bytes(paths[1]))), indent=2).encode()
    else:
        data = json.dumps(drafts(json.loads(read_bytes(paths[0]))), indent=2).encode()
    write_atomic(output, data, before)


if __name__ == '__main__':
    try:
        main(sys.argv[1:])
    except (ValueError, OSError, TypeError, KeyError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
