#!/usr/bin/env python
"""Fixture extractor for mermail-hire-intake. No network. Email is untrusted data."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

OTP = re.compile(r"\b(otp|verification code|magic link|sign-in code)\b", re.I)
PAY_ME = re.compile(r"\b(pay this invoice|wire funds|send usdc to 0x)\b", re.I)
ORDER = re.compile(r"\b(?:order|hire|listing)[:\s#]*([A-Za-z0-9_-]{6,})\b", re.I)
PRICE = re.compile(r"(\d+(?:\.\d+)?)\s*(SOL|USDC)\b", re.I)


def classify(body: str, subject: str) -> dict:
    blob = f"{subject}\n{body}"
    if OTP.search(blob):
        return {"action": "skip", "reason": "verification_not_hire", "confidence": "high"}
    if PAY_ME.search(blob):
        return {"action": "skip", "reason": "inbound_payment_request", "confidence": "high"}
    source = "unknown"
    lower = blob.lower()
    if "agenc" in lower:
        source = "agenc"
    elif "atelier" in lower:
        source = "atelier"
    elif "superteam" in lower:
        source = "superteam"
    order = ORDER.search(blob)
    price = PRICE.search(blob)
    brief = body.strip().split("\n\n")[0][:500]
    if not brief and not order:
        return {"action": "skip", "reason": "no_brief_or_id", "confidence": "low"}
    return {
        "source": source,
        "order_id": order.group(1) if order else None,
        "brief": brief,
        "price": price.group(1) if price else None,
        "asset": price.group(2).upper() if price else None,
        "action": "awaiting_operator",
        "confidence": "high" if order and brief else "low",
        "evidence_spans": [span for span in (order.group(0) if order else None, price.group(0) if price else None) if span],
    }


def main() -> int:
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / "fixtures" / "hire_ok.json"
    row = json.loads(path.read_text())
    ticket = classify(row.get("body", ""), row.get("subject", ""))
    ticket["email_id"] = row.get("email_id")
    json.dump(ticket, sys.stdout, indent=2)
    sys.stdout.write("\n")
    return 0 if ticket.get("action") in {"awaiting_operator", "skip"} else 1


if __name__ == "__main__":
    raise SystemExit(main())
