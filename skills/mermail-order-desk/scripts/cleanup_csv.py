#!/usr/bin/env python3
"""Deterministic CSV cleanup for the mermail-order-desk reference service.

Messy leads CSV in -> CRM-ready CSV out, plus a quarantine file and a JSON
report whose counts are quoted verbatim in the delivery reply.

  python3 cleanup_csv.py IN.csv OUT.csv --quarantine QUAR.csv --report REPORT.json

Rules (stdlib only, fully deterministic):
  - Drop exact-row duplicates (counts them).
  - Validate emails with a conservative regex; bad/missing emails go to
    quarantine with reason `bad_email` (row otherwise preserved there).
  - Normalize US-ish phones to E.164 (+1XXXXXXXXXX); unparseable phones are
    blanked in the clean file and noted (row kept, `phones_blanked` count).
  - Normalize dates to ISO-8601 (tries common US/EU/ISO formats); unparseable
    dates are blanked (row kept, `dates_blanked` count).
  - First row is the header and is preserved as-is.
"""

import csv
import json
import re
import sys
from datetime import datetime

EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")

DATE_FORMATS = (
    "%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y", "%m-%d-%Y", "%d-%m-%Y",
    "%Y/%m/%d", "%b %d, %Y", "%B %d, %Y", "%m/%d/%y", "%d.%m.%Y",
    "%m-%d-%y", "%d-%m-%y", "%d-%b-%Y", "%d-%B-%Y",
)


def norm_phone(raw):
    digits = re.sub(r"\D", "", raw or "")
    if len(digits) == 10:
        return "+1" + digits, False
    if len(digits) == 11 and digits.startswith("1"):
        return "+" + digits, False
    return "", True


def norm_date(raw):
    s = (raw or "").strip()
    if not s:
        return "", True
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(s, fmt).date().isoformat(), False
        except ValueError:
            pass
    try:
        return datetime.fromisoformat(s).date().isoformat(), False
    except ValueError:
        return "", True


def find_col(header, *cands):
    low = [h.strip().lower() for h in header]
    for c in cands:
        if c in low:
            return low.index(c)
    return None


def main(argv):
    if len(argv) < 3:
        print(__doc__)
        return 2
    src, dst = argv[1], argv[2]
    quar = argv[argv.index("--quarantine") + 1] if "--quarantine" in argv else None
    rep = argv[argv.index("--report") + 1] if "--report" in argv else None

    with open(src, newline="", encoding="utf-8-sig") as f:
        rows = list(csv.reader(f))
    if not rows:
        print("empty input", file=sys.stderr)
        return 1
    header, data = rows[0], rows[1:]
    ci_email = find_col(header, "email", "e-mail", "email_address")
    ci_phone = find_col(header, "phone", "tel", "telephone", "mobile")
    ci_date = find_col(header, "date", "created", "signup_date", "signed_up")

    seen, clean, quar_rows = set(), [], []
    dupes = bad_emails = phones_blanked = dates_blanked = 0
    for r in data:
        if not any((c or "").strip() for c in r):
            continue
        key = tuple(r)
        if key in seen:
            dupes += 1
            continue
        seen.add(key)
        r = list(r) + [""] * (len(header) - len(r))
        if ci_email is not None and not EMAIL_RE.match((r[ci_email] or "").strip()):
            bad_emails += 1
            quar_rows.append(r + ["bad_email"])
            continue
        if ci_phone is not None:
            r[ci_phone], bad = norm_phone(r[ci_phone])
            phones_blanked += bad
        if ci_date is not None:
            r[ci_date], bad = norm_date(r[ci_date])
            dates_blanked += bad
        clean.append(r)

    with open(dst, "w", newline="", encoding="utf-8") as f:
        csv.writer(f).writerows([header] + clean)
    if quar:
        with open(quar, "w", newline="", encoding="utf-8") as f:
            csv.writer(f).writerows([header + ["quarantine_reason"]] + quar_rows)
    report = {
        "rows_in": len(data),
        "rows_out": len(clean),
        "dupes_removed": dupes,
        "bad_emails_quarantined": bad_emails,
        "phones_blanked": phones_blanked,
        "dates_blanked": dates_blanked,
    }
    if rep:
        with open(rep, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2)
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
