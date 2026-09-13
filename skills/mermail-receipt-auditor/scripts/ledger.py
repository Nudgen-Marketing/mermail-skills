#!/usr/bin/env python3
"""Mermail receipt auditor ledger engine.

Local, dependency-free spend ledger for the mermail-receipt-auditor skill.
The ledger is append-only JSONL (`ledger.jsonl`); `ledger.csv` is a derived
view regenerated from it. Email content never writes directly: the agent
extracts fields per references/tools.md and appends through this CLI.

Commands:
  add       Append one receipt entry (fails on duplicates).
  void      Append a void correction referencing an earlier emailId.
  export-csv Regenerate ledger.csv from ledger.jsonl.
  summary   Totals grouped by month (and optionally category).
  query     Filtered entries/total by period, vendor, category, currency.
  schema    Print the canonical entry schema.
  doctor    Check ledger file integrity (duplicates, malformed lines).

Design invariants (see references/security.md):
  - ledger.jsonl is append-only; corrections are new void entries.
  - money is always amount + ISO 4217 currency, or currency "unknown".
  - dedupe: exact emailId, then (vendor, amount, currency, date) within
    +/-1 day tolerance.
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

LEDGER_FILE = "ledger.jsonl"
CSV_FILE = "ledger.csv"
SCHEMA_VERSION = 1
DAY_TOLERANCE = timedelta(days=1)

FIELDS = [
    "type",          # "receipt" | "void"
    "schemaVersion",
    "emailId",       # Mermail email id (dedupe key)
    "mailboxId",     # mailbox public_id the receipt was read from
    "vendor",
    "amount",        # decimal string, no symbols/separators; voids omit
    "currency",      # ISO 4217 or "unknown"
    "date",          # ISO 8601 receipt/charge date
    "category",      # user taxonomy or "uncategorized"
    "confidence",    # high | medium | low
    "evidence",      # short quoted fragment backing amount/date
    "recordedAt",    # UTC timestamp of the append
    "voidsEmailId",  # void entries only: emailId being corrected
    "reason",        # void entries only
]

QUERY_FIELDS = ("vendor", "category", "currency", "emailId")


class LedgerError(Exception):
    pass


def utcnow() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_date(value: str) -> datetime:
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)
    except (ValueError, AttributeError) as exc:
        raise LedgerError(f"invalid ISO 8601 date: {value!r}") from exc


def load_entries(ledger: Path) -> list[dict[str, Any]]:
    if not ledger.exists():
        return []
    entries: list[dict[str, Any]] = []
    for lineno, line in enumerate(ledger.read_text(encoding="utf-8").splitlines(), 1):
        stripped = line.strip()
        if not stripped:
            continue
        try:
            entries.append(json.loads(stripped))
        except json.JSONDecodeError as exc:
            raise LedgerError(f"{ledger}:{lineno}: malformed JSONL line: {exc}") from exc
    return entries


def validate_receipt(entry: dict[str, Any]) -> None:
    for field in ("emailId", "mailboxId", "vendor", "amount", "date"):
        if not entry.get(field):
            raise LedgerError(f"missing required field: {field}")
    amount = str(entry["amount"])
    try:
        value = float(amount)
    except ValueError as exc:
        raise LedgerError(f"amount must be a decimal number, got {amount!r}") from exc
    if value < 0:
        raise LedgerError("amount must be non-negative (refunds are negative-amount receipts or voids)")
    currency = entry.get("currency", "unknown")
    if currency != "unknown" and (len(currency) != 3 or not currency.isalpha() or not currency.isupper()):
        raise LedgerError(f"currency must be ISO 4217 or 'unknown', got {currency!r}")
    parse_date(entry["date"])
    if entry.get("confidence", "low") not in ("high", "medium", "low"):
        raise LedgerError(f"confidence must be high|medium|low, got {entry.get('confidence')!r}")


def active_email_ids(entries: list[dict[str, Any]]) -> set[str]:
    voided = {e.get("voidsEmailId") for e in entries if e.get("type") == "void"}
    return {
        e["emailId"]
        for e in entries
        if e.get("type") == "receipt" and e["emailId"] not in voided
    }


def find_duplicate(entries: list[dict[str, Any]], receipt: dict[str, Any]) -> str | None:
    """Return the emailId of an existing entry this receipt duplicates."""
    date = parse_date(receipt["date"])
    for existing in entries:
        if existing.get("type") != "receipt":
            continue
        if existing["emailId"] == receipt["emailId"]:
            return existing["emailId"]
        same_tuple = (
            existing.get("vendor") == receipt.get("vendor")
            and str(existing.get("amount")) == str(receipt.get("amount"))
            and existing.get("currency", "unknown") == receipt.get("currency", "unknown")
        )
        if same_tuple and abs(parse_date(existing["date"]) - date) <= DAY_TOLERANCE:
            return existing["emailId"]
    return None


def append_entry(ledger: Path, entry: dict[str, Any]) -> None:
    ledger.parent.mkdir(parents=True, exist_ok=True)
    with ledger.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(entry, ensure_ascii=False, sort_keys=False) + "\n")


def cmd_add(args: argparse.Namespace) -> int:
    ledger = Path(args.dir) / LEDGER_FILE
    entry = {
        "type": "receipt",
        "schemaVersion": SCHEMA_VERSION,
        "emailId": args.email_id,
        "mailboxId": args.mailbox_id,
        "vendor": args.vendor,
        "amount": args.amount,
        "currency": args.currency or "unknown",
        "date": args.date,
        "category": args.category or "uncategorized",
        "confidence": args.confidence,
        "evidence": args.evidence or "",
        "recordedAt": utcnow(),
    }
    validate_receipt(entry)
    entries = load_entries(ledger)
    if entry["emailId"] in active_email_ids(entries):
        print(f"DUPLICATE_SKIPPED emailId={entry['emailId']} already recorded", file=sys.stderr)
        return 2
    dup = find_duplicate(entries, entry)
    if dup:
        print(
            f"DUPLICATE_SKIPPED matches existing emailId={dup} "
            f"(vendor/amount/currency/date within +/-1 day)",
            file=sys.stderr,
        )
        return 2
    append_entry(ledger, entry)
    print(f"RECORDED emailId={entry['emailId']} {entry['amount']} {entry['currency']} {entry['vendor']}")
    return 0


def cmd_void(args: argparse.Namespace) -> int:
    ledger = Path(args.dir) / LEDGER_FILE
    entries = load_entries(ledger)
    if args.email_id not in active_email_ids(entries):
        raise LedgerError(f"no active receipt with emailId={args.email_id} to void")
    entry = {
        "type": "void",
        "schemaVersion": SCHEMA_VERSION,
        "emailId": f"void-{args.email_id}",
        "mailboxId": "",
        "vendor": "",
        "currency": "unknown",
        "category": "uncategorized",
        "confidence": "high",
        "date": utcnow()[:10],
        "recordedAt": utcnow(),
        "voidsEmailId": args.email_id,
        "reason": args.reason,
    }
    append_entry(ledger, entry)
    print(f"VOIDED emailId={args.email_id} reason={args.reason}")
    return 0


def active_receipts(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    active = active_email_ids(entries)
    return [e for e in entries if e.get("type") == "receipt" and e["emailId"] in active]


def month_key(entry: dict[str, Any]) -> str:
    return entry["date"][:7]


def in_period(entry: dict[str, Any], period: str | None) -> bool:
    if not period:
        return True
    date = entry["date"]
    if len(period) == 7:
        return date.startswith(period)
    return date[:10] == period


def filtered(entries: list[dict[str, Any]], args: argparse.Namespace) -> list[dict[str, Any]]:
    out = []
    for e in active_receipts(entries):
        if not in_period(e, getattr(args, "period", None)):
            continue
        mismatch = any(
            (value := getattr(args, f, None)) and e.get(f) != value
            for f in QUERY_FIELDS
        )
        if mismatch:
            continue
        out.append(e)
    return out


def cmd_summary(args: argparse.Namespace) -> int:
    entries = load_entries(Path(args.dir) / LEDGER_FILE)
    rows = filtered(entries, args)
    by_currency: dict[str, float] = {}
    by_group: dict[str, dict[str, float]] = {}
    for e in rows:
        amount = float(e["amount"])
        cur = e["currency"]
        by_currency[cur] = by_currency.get(cur, 0.0) + amount
        if args.by == "category":
            key = f"{month_key(e)}|{e['category']}"
        elif args.by == "vendor":
            key = f"{month_key(e)}|{e['vendor']}"
        else:
            key = month_key(e)
        bucket = by_group.setdefault(key, {})
        bucket[cur] = bucket.get(cur, 0.0) + amount
    print(f"entries={len(rows)} (scanned ledger: {len(entries)} lines)")
    for key in sorted(by_group):
        parts = ", ".join(f"{value:.2f} {code}" for code, value in sorted(by_group[key].items()))
        print(f"  {key}: {parts}")
    totals = ", ".join(f"{v:.2f} {c}" for c, v in sorted(by_currency.items())) or "nothing recorded"
    print(f"TOTAL {totals}")
    return 0


def cmd_query(args: argparse.Namespace) -> int:
    entries = load_entries(Path(args.dir) / LEDGER_FILE)
    rows = filtered(entries, args)
    for e in sorted(rows, key=lambda x: x["date"]):
        print(
            f"{e['date'][:10]}  {e['amount']:>12} {e['currency']:<3}  "
            f"{e['vendor']:<24.24} {e['category']:<14.14} emailId={e['emailId']}"
        )
    totals: dict[str, float] = {}
    for e in rows:
        totals[e["currency"]] = totals.get(e["currency"], 0.0) + float(e["amount"])
    print(f"-- {len(rows)} receipts, TOTAL " + (", ".join(f"{v:.2f} {c}" for c, v in sorted(totals.items())) or "0"))
    return 0


def mean_gap_days(dates: list[datetime]) -> float:
    gaps = [(dates[i + 1] - dates[i]).days for i in range(len(dates) - 1)]
    return sum(gaps) / len(gaps)


def cmd_recurring(args: argparse.Namespace) -> int:
    entries = load_entries(Path(args.dir) / LEDGER_FILE)
    rows = active_receipts(entries)
    groups: dict[tuple[str, str, str], list[dict[str, Any]]] = {}
    for e in rows:
        key = (e["vendor"], str(e["amount"]), e["currency"])
        groups.setdefault(key, []).append(e)
    found = 0
    for (vendor, amount, currency), group in sorted(groups.items()):
        if len(group) < args.min_occurrences:
            continue
        ordered = sorted(group, key=lambda x: parse_date(x["date"]))
        dates = [parse_date(e["date"]) for e in ordered]
        gaps = [(dates[i + 1] - dates[i]).days for i in range(len(dates) - 1)]
        if not gaps or max(gaps) > args.max_gap_days:
            continue
        cadence = round(mean_gap_days(dates))
        next_date = dates[-1] + timedelta(days=cadence)
        found += 1
        ids = ", ".join(e["emailId"] for e in ordered)
        print(
            f"RECURRING {vendor} {amount} {currency} x{len(ordered)} "
            f"cadence~{cadence}d next~{next_date.date()} emailIds=[{ids}]"
        )
    if not found:
        print("NO_RECURRING_CHARGES_DETECTED")
    return 0


def cmd_export_csv(args: argparse.Namespace) -> int:
    ledger = Path(args.dir) / LEDGER_FILE
    entries = load_entries(ledger)
    rows = active_receipts(entries)
    out = Path(args.dir) / CSV_FILE
    with out.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=FIELDS, extrasaction="ignore")
        writer.writeheader()
        for e in sorted(rows, key=lambda x: (x["date"], x["emailId"])):
            writer.writerow(e)
    print(f"EXPORTED {len(rows)} receipts -> {out}")
    return 0


def cmd_schema(_args: argparse.Namespace) -> int:
    print(json.dumps({
        "receipt": {f: "<value>" for f in FIELDS if f not in ("voidsEmailId", "reason")},
        "void": {"type": "void", "voidsEmailId": "<emailId>", "reason": "<why>", "emailId": "void-<emailId>"},
        "rules": [
            "append-only JSONL; never edit history",
            "amount: decimal string; currency: ISO 4217 or 'unknown'",
            "dedupe: emailId exact, then vendor+amount+currency+date within +/-1 day",
            "confidence: high|medium|low per extraction evidence",
        ],
    }, indent=2))
    return 0


def cmd_doctor(args: argparse.Namespace) -> int:
    ledger = Path(args.dir) / LEDGER_FILE
    entries = load_entries(ledger)  # raises on malformed lines
    seen: dict[str, int] = {}
    dupes: list[str] = []
    for e in entries:
        if e.get("type") == "receipt":
            if e["emailId"] in seen:
                dupes.append(e["emailId"])
            seen[e["emailId"]] = seen.get(e["emailId"], 0) + 1
    voided = {e.get("voidsEmailId") for e in entries if e.get("type") == "void"}
    dangling = sorted(str(v) for v in voided if v not in seen)
    print(f"lines={len(entries)} receipts={sum(seen.values())} voids={len(voided)}")
    if dupes:
        print(f"WARN duplicate emailId lines (file history, not active set): {sorted(set(dupes))}")
    if dangling:
        print(f"WARN voids referencing unknown emailIds: {sorted(dangling)}")
    if not dupes and not dangling:
        print("LEDGER OK")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="ledger.py", description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="command", required=True)

    def common(p: argparse.ArgumentParser) -> None:
        p.add_argument("--dir", default=".", help="ledger directory (default: cwd)")

    p = sub.add_parser("add", help="append one receipt")
    common(p)
    p.add_argument("--email-id", required=True)
    p.add_argument("--mailbox-id", required=True)
    p.add_argument("--vendor", required=True)
    p.add_argument("--amount", required=True)
    p.add_argument("--currency", default=None)
    p.add_argument("--date", required=True, help="ISO 8601 receipt date")
    p.add_argument("--category", default=None)
    p.add_argument("--confidence", choices=["high", "medium", "low"], default="low")
    p.add_argument("--evidence", default=None, help="short quoted fragment backing amount/date")
    p.set_defaults(func=cmd_add)

    p = sub.add_parser("void", help="append a void correction")
    common(p)
    p.add_argument("--email-id", required=True, help="emailId of the receipt to void")
    p.add_argument("--reason", required=True)
    p.set_defaults(func=cmd_void)

    p = sub.add_parser("export-csv", help="regenerate ledger.csv")
    common(p)
    p.set_defaults(func=cmd_export_csv)

    p = sub.add_parser("summary", help="monthly/category totals")
    common(p)
    p.add_argument("--period", default=None, help="YYYY-MM or YYYY-MM-DD")
    p.add_argument("--by", choices=["month", "category", "vendor"], default="month")
    p.add_argument("--vendor", default=None)
    p.add_argument("--category", default=None)
    p.add_argument("--currency", default=None)
    p.set_defaults(func=cmd_summary)

    p = sub.add_parser("query", help="filtered entry list + total")
    common(p)
    p.add_argument("--period", default=None, help="YYYY-MM or YYYY-MM-DD")
    p.add_argument("--vendor", default=None)
    p.add_argument("--category", default=None)
    p.add_argument("--currency", default=None)
    p.add_argument("--email-id", default=None)
    p.set_defaults(func=cmd_query)

    p = sub.add_parser("recurring", help="detect recurring charges (vendor+amount cadence)")
    common(p)
    p.add_argument("--min-occurrences", type=int, default=2)
    p.add_argument("--max-gap-days", type=int, default=45, help="ignore groups whose gaps exceed this")
    p.set_defaults(func=cmd_recurring)

    p = sub.add_parser("schema", help="print entry schema")
    common(p)
    p.set_defaults(func=cmd_schema)

    p = sub.add_parser("doctor", help="integrity check")
    common(p)
    p.set_defaults(func=cmd_doctor)

    args = parser.parse_args(argv)
    try:
        return args.func(args)
    except LedgerError as exc:
        print(f"ERROR {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
