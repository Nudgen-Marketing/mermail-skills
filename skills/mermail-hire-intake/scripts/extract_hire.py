#!/usr/bin/env python
"""Fixture extractor for mermail-hire-intake. No network. Email is untrusted data."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

OTP = re.compile(r"\b(otp|verification code|magic link|sign-in code)\b", re.I)
PAY_ME = re.compile(r"\b(pay this invoice|wire funds|send usdc to 0x|invoice due|please remit|amount due|payment required)\b", re.I)
IDENTIFIER = re.compile(r"\b(order|listing)(?:\s+id)?[:\s#]+([A-Za-z0-9_-]{6,})\b", re.I)
# Capture the whole token, not a positive suffix of -5, 1e3 or 5/10.
PRICE = re.compile(r"(?<!\S)(\S+?)\s*(SOL|USDC)\b", re.I)
DECIMAL = re.compile(r"(?:0|[1-9][0-9]*)(?:\.[0-9]+)?\Z")
HIRE = re.compile(r"\b(you (?:were|have been) hired|hire (?:paid|confirmed)|paid (?:work )?order|work order|(?:order|bounty) (?:awarded|accepted)|you (?:won|have won) (?:the |a )?bounty)\b", re.I)
BRIEF = re.compile(r"^\s*brief\s*:\s*", re.I | re.M)
FIELD = re.compile(r"^[ \t]*(?:(?:reward|price|budget)\s*:?\s*[+\-\u2212.0-9]|deadline\s*:?\s*\S|(?:order|listing)(?:\s+id)?\s*[:#])", re.I | re.M)
DEADLINE = re.compile(r"\bdeadline\s*:?\s*(.+?)(?=\.\s+(?:order|listing|reward|price)\b|\n|$)", re.I)


def classify(body: str, subject: str) -> dict:
    if not isinstance(body, str) or not isinstance(subject, str):
        return {"action": "skip", "reason": "invalid_input", "confidence": "low"}
    if len(body) + len(subject) > 10000:
        return {"action": "skip", "reason": "input_exceeds_read_budget", "confidence": "low"}
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
    # A board name, order-like token or nonempty prose is not a hire notice.
    if not HIRE.search(blob):
        return {"action": "skip", "reason": "not_confirmed_hire", "confidence": "low"}
    label = BRIEF.search(body)
    brief = ""
    identifier_blob = blob
    if label:
        rest = body[label.end():]
        next_field = FIELD.search(rest)
        brief_end = label.end() + (next_field.start() if next_field else len(rest))
        brief = body[label.end():brief_end].strip()
        identifier_blob = f"{subject}\n{body[:label.start()]}\n{body[brief_end:]}"
    else:
        # Unlabelled task paragraphs may be retained, never the hire intro alone.
        brief = "\n\n".join(part.strip() for part in re.split(r"\n\s*\n", body)
                              if part.strip() and not HIRE.search(part) and not FIELD.match(part))
    ids = {kind: set() for kind in ("order", "listing")}
    evidence = []
    for match in IDENTIFIER.finditer(identifier_blob):
        if match.group(2).lower() not in {"confirmed", "received", "details", "notification"}:
            ids[match.group(1).lower()].add(match.group(2))
            evidence.append(match.group(0))
    if any(len(values) > 1 for values in ids.values()):
        return {"action": "skip", "reason": "conflicting_identifiers", "confidence": "low"}
    if not brief and not any(ids.values()):
        return {"action": "skip", "reason": "no_brief_or_id", "confidence": "low"}
    prices = {}
    for match in PRICE.finditer(blob):
        amount = match.group(1)
        if (not DECIMAL.fullmatch(amount) or
                re.search(r"[+\-\u2212]\s*$", blob[:match.start()]) or
                not any(d in "123456789" for d in amount)):
            return {"action": "skip", "reason": "invalid_price", "confidence": "low"}
        normalized = amount.rstrip("0").rstrip(".") if "." in amount else amount
        prices.setdefault((normalized, match.group(2).upper()), (amount, match.group(2).upper()))
        evidence.append(match.group(0))
    if len(prices) > 1:
        return {"action": "skip", "reason": "conflicting_prices", "confidence": "low"}
    price, asset = next(iter(prices.values()), (None, None))
    deadlines = list(DEADLINE.finditer(body))
    deadline_values = {match.group(1).strip().removesuffix(".") for match in deadlines}
    if len(deadline_values) > 1:
        return {"action": "skip", "reason": "conflicting_deadlines", "confidence": "low"}
    evidence.extend(match.group(0) for match in deadlines)
    if brief:
        evidence.append(body[label.start():brief_end].strip() if label else brief)
    order = next(iter(ids["order"]), None)
    listing = next(iter(ids["listing"]), None)
    return {
        "source": source,
        "order_id": order,
        "listing": listing,
        "brief": brief,
        "deadline": next(iter(deadline_values), None),
        "price": price,
        "asset": asset,
        "action": "awaiting_operator",
        "confidence": "high" if (order or listing) and brief and price else "low",
        "evidence_spans": evidence,
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
