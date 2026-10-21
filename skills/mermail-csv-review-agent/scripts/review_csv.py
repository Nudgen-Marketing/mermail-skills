"""Review one UTF-8 CSV using an owner-supplied policy; never infer missing data."""

import argparse
import csv
import hashlib
import io
import json
from collections import Counter
from pathlib import Path


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def review(raw, policy):
    if len(raw) > 1024 * 1024:
        raise ValueError('CSV exceeds the 1 MiB review limit')
    columns = policy.get('columns')
    if not isinstance(columns, list) or not columns or any(not isinstance(c, str) or not c for c in columns):
        raise ValueError('Policy needs a non-empty list of column names')
    if len(set(columns)) != len(columns):
        raise ValueError('Policy column names must be unique')
    selectors = {}
    for name in ('required', 'trim', 'unique_key'):
        value = policy.get(name, [])
        if not isinstance(value, list) or any(not isinstance(c, str) or c not in columns for c in value):
            raise ValueError(f'{name} must list existing columns')
        selectors[name] = value
    allowed = policy.get('allowed_values', {})
    if not isinstance(allowed, dict) or any(c not in columns or not isinstance(v, list) or any(not isinstance(x, str) for x in v) for c, v in allowed.items()):
        raise ValueError('allowed_values must map existing columns to lists of strings')
    unknown = set(policy) - {'columns', 'required', 'trim', 'unique_key', 'allowed_values'}
    if unknown:
        raise ValueError(f'Unknown policy fields: {sorted(unknown)}')

    reader = csv.reader(io.StringIO(raw.decode('utf-8-sig'), newline=''), strict=True)
    if next(reader, None) != columns:
        raise ValueError('CSV header does not exactly match the owner policy')
    records = []
    changes = []
    keys = Counter()
    for number, values in enumerate(reader, start=2):
        if number > 10001:
            raise ValueError('CSV exceeds the 10,000-record review limit')
        item = {'input_record': number, 'original': values, 'issues': []}
        if len(values) != len(columns):
            item['issues'].append({'code': 'field_count', 'expected': len(columns), 'actual': len(values)})
            records.append(item)
            continue
        row = dict(zip(columns, values))
        for column in selectors['trim']:
            trimmed = row[column].strip()
            if trimmed != row[column]:
                changes.append({'input_record': number, 'column': column, 'before': row[column], 'after': trimmed})
                row[column] = trimmed
        item['candidate'] = row
        for column in selectors['required']:
            if not row[column].strip():
                item['issues'].append({'code': 'missing_required', 'column': column})
        for column, choices in allowed.items():
            if row[column] not in choices:
                item['issues'].append({'code': 'not_allowed', 'column': column})
        # 公式样式单元格保留到 JSON 异常记录，避免随可直接打开的 CSV 交付。
        for column, value in row.items():
            if value.lstrip().startswith(('=', '+', '-', '@')) or value.startswith(('\t', '\r', '\n')):
                item['issues'].append({'code': 'spreadsheet_formula_like', 'column': column})
        if selectors['unique_key']:
            key = tuple(row[c] for c in selectors['unique_key'])
            if all(value.strip() for value in key):
                item['_key'] = key
                keys[key] += 1
        records.append(item)

    accepted, held = [], []
    for item in records:
        key = item.pop('_key', None)
        if key is not None and keys[key] > 1:
            item['issues'].append({'code': 'duplicate_key', 'columns': selectors['unique_key'], 'occurrences': keys[key]})
        if item['issues']:
            held.append(item)
        else:
            accepted.append(item)
    # 不挑选重复记录的胜者，保留全部冲突项供用户决定。
    return {
        'status': 'needs_review' if held else 'validated',
        'input_sha256': digest(raw),
        'policy_sha256': digest(json.dumps(policy, sort_keys=True, ensure_ascii=False).encode()),
        'input_records': len(records),
        'candidate_records': len(accepted),
        'held_records': len(held),
        'issue_counts': dict(Counter(issue['code'] for item in held for issue in item['issues'])),
        'changes': changes,
        'accepted': accepted,
        'held': held,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, required=True)
    parser.add_argument('--rules', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    policy = json.loads(args.rules.read_text(encoding='utf-8'))
    result = review(args.input.read_bytes(), policy)
    args.out.mkdir(parents=True, exist_ok=False)
    with (args.out / 'candidates.csv').open('w', newline='', encoding='utf-8') as stream:
        writer = csv.DictWriter(stream, fieldnames=policy['columns'])
        writer.writeheader()
        writer.writerows(item['candidate'] for item in result['accepted'])
    (args.out / 'review.json').write_text(json.dumps(result, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    summary = {k: result[k] for k in ('status', 'input_sha256', 'policy_sha256', 'input_records', 'candidate_records', 'held_records', 'issue_counts')}
    summary['outputs'] = {name: digest((args.out / name).read_bytes()) for name in ('candidates.csv', 'review.json')}
    (args.out / 'manifest.json').write_text(json.dumps(summary, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(summary, indent=2))


if __name__ == '__main__':
    main()
