#!/usr/bin/env python3
"""Build a deterministic register from structured vendor policy claims."""

import argparse
import json
import sys
from datetime import date, datetime
from pathlib import Path


POLICY_TYPES = {
    "acceptable_use",
    "data_processing",
    "privacy",
    "retention",
    "security",
    "service_policy",
    "subprocessors",
    "terms",
}


def parse_day(value):
    if value in (None, ""):
        return None
    try:
        return date.fromisoformat(str(value))
    except ValueError as exc:
        raise ValueError(f"invalid ISO date: {value}") from exc


def read_payload(path):
    if path == "-":
        return json.load(sys.stdin)
    with Path(path).open(encoding="utf-8") as handle:
        return json.load(handle)


def classify(as_of, window, effective_day, old_value, new_value):
    if old_value is None and new_value is None:
        return "needs_review", None
    if effective_day is None:
        return "undated", None
    days = (effective_day - as_of).days
    if days < 0:
        return "in_effect", days
    if days <= 7:
        return "urgent", days
    if days <= window:
        return "upcoming", days
    return "later", days


def build(payload):
    as_of = parse_day(payload.get("as_of")) or datetime.now().date()
    window = int(payload.get("review_window_days", 90))
    if window < 1 or window > 366:
        raise ValueError("review_window_days must be between 1 and 366")
    claims = payload.get("claims")
    if not isinstance(claims, list):
        raise ValueError("claims must be a JSON array")

    rows = []
    for index, claim in enumerate(claims):
        if not isinstance(claim, dict):
            raise ValueError(f"claim {index} must be an object")
        policy_type = claim.get("policy_type")
        if policy_type not in POLICY_TYPES:
            raise ValueError(f"claim {index} has unsupported policy_type: {policy_type}")
        sources = claim.get("source_email_ids", [])
        if not isinstance(sources, list) or not all(isinstance(item, str) for item in sources):
            raise ValueError(f"claim {index} source_email_ids must be a string array")
        if not sources:
            raise ValueError(f"claim {index} must include at least one source_email_id")
        old_value = claim.get("old_value")
        new_value = claim.get("new_value")
        effective_day = parse_day(claim.get("effective_date"))
        status, days = classify(as_of, window, effective_day, old_value, new_value)
        rows.append(
            {
                "vendor": claim.get("vendor"),
                "product": claim.get("product"),
                "policy_type": policy_type,
                "field": claim.get("field"),
                "old_value": old_value,
                "new_value": new_value,
                "effective_date": effective_day.isoformat() if effective_day else None,
                "status": status,
                "days_to_effective": days,
                "impact_authority": claim.get("impact_authority", "unknown"),
                "stated_impact": claim.get("stated_impact"),
                "evidence_phrase": claim.get("evidence_phrase"),
                "confidence": claim.get("confidence", "needs_review"),
                "source_email_ids": sorted(set(sources)),
            }
        )

    rank = {
        "urgent": 0,
        "in_effect": 1,
        "upcoming": 2,
        "needs_review": 3,
        "undated": 4,
        "later": 5,
    }
    rows.sort(
        key=lambda row: (
            rank[row["status"]],
            row["days_to_effective"] is None,
            row["days_to_effective"] or 0,
            row["vendor"] or "",
            row["policy_type"],
        )
    )
    counts = {name: sum(row["status"] == name for row in rows) for name in rank}
    return {
        "as_of": as_of.isoformat(),
        "review_window_days": window,
        "counts": counts,
        "items": rows,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", nargs="?", default="-", help="JSON file, or - for stdin")
    parser.add_argument("--pretty", action="store_true", help="Indent JSON output")
    args = parser.parse_args()
    try:
        result = build(read_payload(args.input))
    except (OSError, ValueError, json.JSONDecodeError, TypeError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    json.dump(result, sys.stdout, indent=2 if args.pretty else None, sort_keys=True)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
