"""Bounded, read-only extraction of reported delivery outcomes (not proof)."""

import argparse
import hashlib
import json
import re
import sys
from email import policy
from email.parser import BytesParser

MAX_BYTES = 1024 * 1024
MAX_RECIPIENTS = 100
ACTIONS = {"failed", "delayed", "delivered", "relayed", "expanded"}
STATUS_CLASSES = {
    "failed": {"4", "5"}, "delayed": {"4"},
    "delivered": {"2"}, "relayed": {"2"}, "expanded": {"2"},
}


def field(block, name, warnings, required=False):
    values = block.get_all(name, [])
    if len(values) > 1:
        warnings.append(f"duplicate {name}")
        return None
    if not values:
        if required:
            warnings.append(f"missing {name}")
        return None
    value = str(values[0]).strip()
    if not value:
        warnings.append(f"empty {name}")
        return None
    return value


def typed_field(value):
    """Keep the address type and exact address value, including local-part case."""
    if value is None:
        return None
    match = re.fullmatch(r"([A-Za-z0-9-]+)\s*;\s*(\S[^\r\n]*)", value)
    return {"type": match[1].lower(), "value": match[2]} if match else None


def validate_content_type(message):
    """Do not select one interpretation of ambiguous MIME metadata."""
    headers = message.get_all("Content-Type", [])
    if len(headers) > 1 or any(header.defects for header in headers):
        raise ValueError("ambiguous or malformed Content-Type")


def parse_report(raw: bytes, email_id: str, input_format: str = "eml") -> dict:
    if not raw or len(raw) > MAX_BYTES:
        raise ValueError("input must contain 1 to 1048576 bytes")
    if input_format not in {"eml", "dsn"}:
        raise ValueError("unsupported input format")
    source = raw
    if input_format == "dsn":
        raw = b"Content-Type: message/delivery-status\r\n\r\n" + raw
    message = BytesParser(policy=policy.default).parsebytes(raw)
    validate_content_type(message)
    if input_format == "eml":
        if (message.get_content_type() != "multipart/report"
                or message.get_param("report-type", "").lower() != "delivery-status"):
            raise ValueError("expected a top-level delivery-status multipart/report")
        # Do not walk into an attached original or a forwarded report.
        direct_parts = list(message.iter_parts())
        for part in direct_parts:
            validate_content_type(part)
        parts = [p for p in direct_parts
                 if p.get_content_type() == "message/delivery-status"]
        if len(parts) != 1:
            raise ValueError("expected exactly one direct delivery-status part")
        report = parts[0]
    else:
        report = message
    blocks = report.get_payload()
    if not isinstance(blocks, list) or not 2 <= len(blocks) <= MAX_RECIPIENTS + 1:
        raise ValueError("expected one message block and 1 to 100 recipient blocks")
    warnings = []
    if message.defects or report.defects or any(b.defects for b in blocks):
        warnings.append("MIME parser defects; inspect source")
    mta = typed_field(field(blocks[0], "Reporting-MTA", warnings, required=True))
    if mta is None:
        warnings.append("invalid Reporting-MTA")
    envelope = field(blocks[0], "Original-Envelope-Id", warnings)
    recipients = []
    for block in blocks[1:]:
        review = []
        recipient = typed_field(field(block, "Final-Recipient", review, required=True))
        if recipient is None:
            review.append("invalid Final-Recipient")
        action = field(block, "Action", review, required=True)
        action = action.lower() if action else None
        status = field(block, "Status", review, required=True)
        if action not in ACTIONS:
            review.append("unsupported Action")
        if not status or not re.fullmatch(r"[245]\.[0-9]{1,3}\.[0-9]{1,3}", status):
            review.append("unsupported Status syntax")
        elif action in ACTIONS and status[0] not in STATUS_CLASSES[action]:
            review.append("Action and Status disagree")
        recipients.append({
            "recipient": recipient, "reported_action": action, "status": status,
            "diagnostic": field(block, "Diagnostic-Code", review),
            "will_retry_until": field(block, "Will-Retry-Until", review),
            "review": review,
        })
    identities = [r["recipient"] for r in recipients]
    for row in recipients:
        if row["recipient"] and identities.count(row["recipient"]) > 1:
            row["review"].append("repeated recipient; do not count twice or resolve silently")
    return {
        "schema_version": 1, "source_email_id": email_id,
        "source_sha256": hashlib.sha256(source).hexdigest(),
        "evidence": "unverified sender report; not delivery or readership proof",
        "reporting_mta": mta, "original_envelope_id": envelope,
        "review": warnings, "recipients": recipients,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", help="local .eml or exact raw DSN part; never a URL")
    parser.add_argument("--email-id", required=True, help="source Mermail email ID")
    parser.add_argument("--format", choices=["eml", "dsn"], default="eml")
    args = parser.parse_args()
    try:
        with open(args.path, "rb") as source:
            raw = source.read(MAX_BYTES + 1)
        result = parse_report(raw, args.email_id, args.format)
    except (OSError, ValueError, RecursionError):
        print("Cannot parse bounded DSN input; inspect the source locally.", file=sys.stderr)
        return 2
    print(json.dumps(result, indent=2, ensure_ascii=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
