#!/usr/bin/env python3
"""Extract a trial/renewal brief from a raw email text file. Untrusted data in, JSON out.

Also ranks search hits so an inbox original beats a draft/Re: auto-reply.
"""
from __future__ import annotations

import json, re, sys
from pathlib import Path

VENDOR_HINTS = [
    ("notion", "Notion"),
    ("figma", "Figma"),
    ("slack", "Slack"),
    ("github", "GitHub"),
    ("linear", "Linear"),
    ("vercel", "Vercel"),
    ("openai", "OpenAI"),
    ("cursor", "Cursor"),
    ("stripe", "Stripe"),
]

TRIAL_MARKERS = re.compile(
    r"trial ending|trial ends|free trial|trial expires|auto-?renew|renews on|"
    r"subscription will renew|your trial",
    re.I,
)
AMOUNT = re.compile(r"(?:usd|usdc|\$)\s*([0-9]+(?:\.[0-9]{1,2})?)|([0-9]+(?:\.[0-9]{1,2})?)\s*(?:usd|usdc)", re.I)
DATE = re.compile(
    r"\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|"
    r"jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|"
    r"dec(?:ember)?)\s+\d{1,2}(?:,?\s*\d{4})?|\d{4}-\d{2}-\d{2}",
    re.I,
)
URL = re.compile(r"https?://([^/\s]+)", re.I)
OTP = re.compile(r"\b(one[- ]time (code|password)|verification code|security code)\b", re.I)

EXCLUDED_FOLDERS = frozenset({"draft", "drafts", "sent", "trash"})


def vendor_from(text: str) -> str | None:
    low = text.lower()
    for needle, name in VENDOR_HINTS:
        if needle in low:
            return name
    m = re.search(r"^From:\s*.*@([A-Za-z0-9.-]+)", text, re.M)
    if m:
        host = m.group(1).lower().split(".")
        if len(host) >= 2:
            return host[-2].title()
    return None


def as_decimal_string(raw: str) -> str:
    """Keep amounts as decimal strings, never floats."""
    if "." not in raw:
        return f"{raw}.00"
    whole, frac = raw.split(".", 1)
    return f"{whole}.{frac[:2].ljust(2, '0')}"


def extract(text: str) -> dict:
    if OTP.search(text) and not TRIAL_MARKERS.search(text):
        return {"action": "skip", "reason": "otp_or_verification_not_trial"}
    if not TRIAL_MARKERS.search(text):
        return {"action": "skip", "reason": "no trial/renewal markers"}

    am = AMOUNT.search(text)
    amount = None
    currency = None
    if am:
        amount = as_decimal_string(am.group(1) or am.group(2))
        currency = "USD"
    dm = DATE.search(text)
    url_host = None
    um = URL.search(text)
    if um:
        url_host = um.group(1).lower()
        if url_host.startswith("www."):
            url_host = url_host[4:]

    vendor = vendor_from(text)
    evidence = []
    tm = TRIAL_MARKERS.search(text)
    if tm:
        evidence.append(tm.group(0))
    if dm:
        evidence.append(dm.group(0))
    if amount:
        evidence.append(f"{amount} {currency}")

    missing = [k for k, v in (("vendor", vendor), ("date", dm), ("amount", amount)) if not v]
    action = "ask"
    confidence = "high" if not missing else ("medium" if len(missing) == 1 else "low")

    return {
        "vendor": vendor,
        "kind": "trial_ending",
        "ends_on": dm.group(0) if dm else None,
        "amount": amount,
        "currency": currency,
        "cancel_url_host": url_host,
        "payee_present": False,
        "action": action,
        "confidence": confidence,
        "evidence": evidence,
        "missing": missing,
    }


def folder_name(email: dict) -> str:
    folder = email.get("folder") or "inbox"
    if isinstance(folder, dict):
        folder = folder.get("name") or folder.get("slug") or "inbox"
    return str(folder).lower()


def is_reply_subject(subject: str | None) -> bool:
    return (subject or "").lstrip().lower().startswith("re:")


def is_auto_draft(email: dict) -> bool:
    if folder_name(email) in {"draft", "drafts"}:
        return True
    if email.get("is_draft") is True:
        return True
    blob = " ".join(
        str(email.get(key) or "")
        for key in ("from", "from_name", "source", "triager", "agent", "created_by")
    ).lower()
    return "triager" in blob or "auto-draft" in blob or "auto draft" in blob


def rank_candidates(emails: list[dict]) -> list[dict]:
    """Prefer inbox originals. Drop draft/sent/trash. Skip Re: unless it is the only candidate."""
    kept = [email for email in emails if folder_name(email) not in EXCLUDED_FOLDERS]
    if not kept:
        return []

    originals = [email for email in kept if not is_reply_subject(email.get("subject"))]
    if originals:
        kept = originals
    # Re: subjects stay only when they are the sole remaining candidate set.

    inbound = [email for email in kept if not is_auto_draft(email)]
    if inbound:
        kept = inbound

    def recency(email: dict) -> str:
        return str(email.get("received_at") or email.get("date") or "")

    return sorted(kept, key=recency, reverse=True)


def load_body(email: dict, base: Path) -> str:
    if email.get("body"):
        return str(email["body"])
    body_file = email.get("body_file")
    if body_file:
        return (base / body_file).read_text(encoding="utf-8", errors="replace")
    return ""


def extract_ranked(path: Path) -> dict:
    payload = json.loads(path.read_text(encoding="utf-8"))
    emails = payload["emails"] if isinstance(payload, dict) else payload
    ranked = rank_candidates(emails)
    if not ranked:
        return {"action": "skip", "reason": "no_inbox_original"}
    winner = ranked[0]
    brief = extract(load_body(winner, path.parent))
    brief["email_id"] = winner.get("id")
    brief["folder"] = folder_name(winner)
    brief["subject"] = winner.get("subject")
    brief["received_at"] = winner.get("received_at")
    return brief


def self_test() -> int:
    root = Path(__file__).resolve().parent.parent / "fixtures"
    ending = extract((root / "trial_ending.txt").read_text(encoding="utf-8"))
    assert ending.get("vendor") == "Notion"
    assert ending.get("amount") == "16.00"
    assert isinstance(ending.get("amount"), str)
    assert ending.get("action") == "ask"

    otp = extract((root / "otp_not_a_trial.txt").read_text(encoding="utf-8"))
    assert otp.get("action") == "skip"

    hits_path = root / "search_hits_draft_vs_inbox.json"
    hits = json.loads(hits_path.read_text(encoding="utf-8"))["emails"]
    newest_first = sorted(hits, key=lambda email: email["received_at"], reverse=True)
    assert newest_first[0]["id"] == "draft-reply-1"
    ranked = rank_candidates(newest_first)
    assert [email["id"] for email in ranked] == ["inbox-original-1"]
    assert rank_candidates([email for email in hits if email["id"] == "draft-reply-1"]) == []

    draft_brief = extract((root / "draft_reply_no_amount.txt").read_text(encoding="utf-8"))
    assert draft_brief.get("amount") is None

    brief = extract_ranked(hits_path)
    assert brief.get("email_id") == "inbox-original-1"
    assert brief.get("folder") == "inbox"
    assert not str(brief.get("subject") or "").lower().startswith("re:")
    assert brief.get("amount") == "16.00"
    assert isinstance(brief.get("amount"), str)
    print("self-test ok")
    return 0


def main() -> int:
    if len(sys.argv) == 2 and sys.argv[1] == "--self-test":
        return self_test()
    if len(sys.argv) == 3 and sys.argv[1] == "--rank":
        print(json.dumps(extract_ranked(Path(sys.argv[2])), indent=2))
        return 0
    if len(sys.argv) != 2:
        print("usage: extract_trial.py <email.txt> | --rank <hits.json> | --self-test", file=sys.stderr)
        return 2
    text = Path(sys.argv[1]).read_text(encoding="utf-8", errors="replace")
    print(json.dumps(extract(text), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
