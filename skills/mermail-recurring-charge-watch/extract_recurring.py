#!/usr/bin/env python3
"""Deterministic recurring-charge extractor for mermail-recurring-charge-watch.

No network. Reads JSON email fixtures from files or stdin and emits a
schema-valid cancellation/audit packet or a skip decision.

Input: one JSON object, a JSON array, or multiple files each containing
an object. Each email uses:

  {
    "id": "msg_...",          # Mermail email id (not RFC message_id)
    "from": "Name <addr>",
    "to": "billing-watch@mermail.app",
    "subject": "...",
    "date": "2026-08-26T18:00:00.000Z",
    "scan_status": "clean",
    "body": "plain text"
  }

Stdout: one JSON object per input email, or a JSON array when more than
one email is processed. Deterministic: same bytes in → same bytes out.
"""

from __future__ import annotations

import json
import re
import sys
from calendar import monthrange
from datetime import date, datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

SCHEMA = "mermail.recurring_charge_watch.v1"
SKILL = "mermail-recurring-charge-watch"

# ---------------------------------------------------------------------------
# Skip / classification signals
# ---------------------------------------------------------------------------

OTP_PATTERNS = (
    r"\bone[-\s]?time (?:password|passcode|code)\b",
    r"\bverification code\b",
    r"\byour (?:login |security )?code is\b",
    r"\benter this code\b",
    r"\b2fa\b",
    r"\bmfa code\b",
    r"\botp\b",
    r"\bmagic link\b",
    r"\bpasswordless\b",
    r"\bconfirm it is you\b",
)

PHISHING_URGENCY = (
    r"\baccount will be (?:suspended|closed|locked|terminated)\b",
    r"\bverify (?:your )?(?:account|identity|payment|card)\b",
    r"\bupdate your (?:card|payment method|billing)\b",
    r"\bimmediate(?:ly)? (?:action|attention) required\b",
    r"\bclick (?:here|below) (?:immediately|now|to (?:verify|secure|unlock))\b",
    r"\bunusual (?:sign[-\s]?in|activity)\b",
    r"\bconfirm your password\b",
    r"\benter your (?:password|ssn|seed phrase|recovery phrase|api key)\b",
    r"\bwithin \d+ hours (?:or|your)\b",
)

LOOKALIKE_HOST_HINTS = (
    r"netfl1x",
    r"netflix-",
    r"paypa1",
    r"paypal-",
    r"micros0ft",
    r"appleid-",
    r"secure-login",
    r"account-verify",
    r"billing-alerts",
    r"verify-now",
    r"login-secure",
)

SHORTENERS = {
    "bit.ly",
    "t.co",
    "tinyurl.com",
    "goo.gl",
    "ow.ly",
    "is.gd",
    "buff.ly",
    "cutt.ly",
}

BRAND_HOSTS = {
    "netflix": ("netflix.com",),
    "linear": ("linear.app",),
    "notion": ("notion.so", "notion.com"),
    "spotify": ("spotify.com",),
    "github": ("github.com",),
    "openai": ("openai.com",),
    "anthropic": ("anthropic.com",),
    "paypal": ("paypal.com",),
    "apple": ("apple.com", "itunes.com"),
    "amazon": ("amazon.com",),
    "microsoft": ("microsoft.com", "office.com"),
    "google": ("google.com", "googleusercontent.com"),
}

RECURRENCE_MONTHLY = (
    r"\bmonthly\b",
    r"\bevery month\b",
    r"\bbilled monthly\b",
    r"\bper month\b",
    r"\b/mo\b",
    r"\bmonth(?:ly)? subscription\b",
    r"\bmonthly membership\b",
    r"\brenews? monthly\b",
)

RECURRENCE_ANNUAL = (
    r"\bannual(?:ly)?\b",
    r"\byearly\b",
    r"\bevery year\b",
    r"\bbilled annual(?:ly)?\b",
    r"\bper year\b",
    r"\b/yr\b",
    r"\bannual (?:plan|invoice|subscription|membership)\b",
    r"\brenews? (?:annually|yearly)\b",
)

RECURRENCE_GENERIC = (
    r"\bsubscription\b",
    r"\bmembership\b",
    r"\bauto[-\s]?renew(?:s|al)?\b",
    r"\brecurring\b",
    r"\bnext (?:bill(?:ing)?|renewal) date\b",
    r"\brenews? on\b",
    r"\bbilled every\b",
    r"\byour next billing date\b",
)

ONESHOT_PATTERNS = (
    r"\bone[-\s]?time(?: invoice| purchase| charge| order| payment)?\b",
    r"\bsingle (?:purchase|order|invoice|charge)\b",
    r"\bnot a subscription\b",
    r"\bno recurring\b",
    r"\bparts order\b",
    r"\bhardware (?:parts|order)\b",
)

AMOUNT_PATTERNS = (
    re.compile(
        r"(?P<label>amount(?:\s+due)?|total(?:\s+charged)?|charged|we charged|"
        r"you (?:were )?charged|paid|payment of|invoice total)\s*[:=\-]?\s*"
        r"(?P<cur>US\$|USD|EUR|GBP|\$|€|£)?\s*"
        r"(?P<amt>\d{1,3}(?:,\d{3})*(?:\.\d{2})|\d+\.\d{2})",
        re.I,
    ),
    re.compile(
        r"(?P<cur>US\$|USD|EUR|GBP|\$|€|£)\s*"
        r"(?P<amt>\d{1,3}(?:,\d{3})*(?:\.\d{2})|\d+\.\d{2})",
        re.I,
    ),
    re.compile(
        r"(?P<amt>\d{1,3}(?:,\d{3})*(?:\.\d{2})|\d+\.\d{2})\s+"
        r"(?P<cur>USD|EUR|GBP)\b",
        re.I,
    ),
)

NEXT_BILL_PATTERNS = (
    re.compile(
        r"(?:next (?:bill(?:ing)?|renewal) date|renews? on|your next billing date|"
        r"next charge(?: date)?|renewal(?: date)?)\s*(?:is|:)?\s*"
        r"(?P<date>[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2}|"
        r"\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}|\d{1,2}/\d{1,2}/\d{4})",
        re.I,
    ),
)

URL_RE = re.compile(r"https?://[^\s<>\")\]]+", re.I)

MANAGE_URL_HINTS = (
    "manage",
    "cancel",
    "account",
    "billing",
    "subscription",
    "membership",
    "settings",
    "youraccount",
)

MONTHS = {
    "january": 1,
    "february": 2,
    "march": 3,
    "april": 4,
    "may": 5,
    "june": 6,
    "july": 7,
    "august": 8,
    "september": 9,
    "october": 10,
    "november": 11,
    "december": 12,
    "jan": 1,
    "feb": 2,
    "mar": 3,
    "apr": 4,
    "jun": 6,
    "jul": 7,
    "aug": 8,
    "sep": 9,
    "sept": 9,
    "oct": 10,
    "nov": 11,
    "dec": 12,
}

CURRENCY_MAP = {
    "$": "USD",
    "us$": "USD",
    "usd": "USD",
    "€": "EUR",
    "eur": "EUR",
    "£": "GBP",
    "gbp": "GBP",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _norm(text: str) -> str:
    return text.replace("\r\n", "\n").replace("\r", "\n")


def _hay(email: dict[str, Any]) -> str:
    return "\n".join(
        [
            str(email.get("from") or ""),
            str(email.get("to") or ""),
            str(email.get("subject") or ""),
            str(email.get("body") or ""),
        ]
    )


def _search_any(patterns: tuple[str, ...], text: str) -> re.Match[str] | None:
    for pat in patterns:
        m = re.search(pat, text, re.I)
        if m:
            return m
    return None


def _span(field: str, text: str, match: re.Match[str] | None, group: int | str = 0) -> dict[str, Any] | None:
    if match is None:
        return None
    try:
        piece = match.group(group)
        start, end = match.span(group)
    except IndexError:
        piece = match.group(0)
        start, end = match.span(0)
    if piece is None:
        return None
    return {"field": field, "span": piece, "start": start, "end": end}


def _parse_from(value: str) -> tuple[str, str]:
    value = (value or "").strip()
    m = re.match(r"^(?P<name>.*?)\s*<\s*(?P<addr>[^>]+)\s*>\s*$", value)
    if m:
        return m.group("name").strip().strip('"'), m.group("addr").strip().lower()
    if "@" in value:
        return "", value.lower()
    return value, ""


def _registrable(host: str) -> str:
    host = host.lower().rstrip(".")
    parts = [p for p in host.split(".") if p]
    if len(parts) >= 2:
        return ".".join(parts[-2:])
    return host


def _host_ok_for_brand(brand: str, host: str) -> bool:
    allowed = BRAND_HOSTS.get(brand.lower())
    if not allowed:
        return True
    h = host.lower().rstrip(".")
    for d in allowed:
        if h == d or h.endswith("." + d):
            return True
    return False


def _claimed_brand(text: str) -> str | None:
    for brand in BRAND_HOSTS:
        if re.search(rf"\b{re.escape(brand)}\b", text, re.I):
            return brand
    return None


def _safe_https_url(raw: str) -> str | None:
    raw = raw.rstrip(").,;]'\"")
    try:
        parsed = urlparse(raw)
    except ValueError:
        return None
    if parsed.scheme.lower() != "https":
        return None
    if parsed.username or parsed.password:
        return None
    host = parsed.hostname or ""
    if not host:
        return None
    if re.fullmatch(r"\d{1,3}(?:\.\d{1,3}){3}", host):
        return None
    if ":" in host and host.count(":") >= 2:
        return None
    if parsed.port not in (None, 443):
        return None
    if _registrable(host) in SHORTENERS:
        return None
    if parsed.path.startswith("//"):
        return None
    return raw


def _extract_urls(text: str) -> list[tuple[str, re.Match[str]]]:
    out: list[tuple[str, re.Match[str]]] = []
    for m in URL_RE.finditer(text):
        safe = _safe_https_url(m.group(0))
        if safe:
            out.append((safe, m))
    return out


def _normalize_amount(raw: str) -> str:
    cleaned = raw.replace(",", "")
    if "." not in cleaned:
        cleaned = cleaned + ".00"
    whole, frac = cleaned.split(".", 1)
    if not whole.isdigit() or not frac.isdigit():
        raise ValueError("non-decimal amount")
    if len(frac) == 1:
        frac = frac + "0"
    if len(frac) > 2:
        # keep exactly two digits only when the source already used cents
        # with extra zeros; otherwise reject (no float rounding)
        if set(frac[2:]) <= {"0"}:
            frac = frac[:2]
        else:
            raise ValueError("amount has more than two decimal places")
    return f"{int(whole)}.{frac}"


def _currency_from(token: str | None, default: str = "USD") -> str:
    if not token:
        return default
    return CURRENCY_MAP.get(token.lower(), token.upper() if token.isalpha() else default)


def _parse_date(raw: str) -> str | None:
    raw = raw.strip().replace(",", " ")
    raw = re.sub(r"\s+", " ", raw)
    m = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})", raw)
    if m:
        y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
        return _iso_date(y, mo, d)
    m = re.fullmatch(r"(\d{1,2})/(\d{1,2})/(\d{4})", raw)
    if m:
        mo, d, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        return _iso_date(y, mo, d)
    m = re.fullmatch(r"([A-Za-z]{3,9})\s+(\d{1,2})\s+(\d{4})", raw)
    if m:
        mo = MONTHS.get(m.group(1).lower())
        if mo:
            return _iso_date(int(m.group(3)), mo, int(m.group(2)))
    m = re.fullmatch(r"(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})", raw)
    if m:
        mo = MONTHS.get(m.group(2).lower())
        if mo:
            return _iso_date(int(m.group(3)), mo, int(m.group(1)))
    return None


def _iso_date(year: int, month: int, day: int) -> str | None:
    try:
        last = monthrange(year, month)[1]
        if 1 <= day <= last:
            return date(year, month, day).isoformat()
    except ValueError:
        return None
    return None


def _merchant(email: dict[str, Any], hay: str) -> tuple[str | None, dict[str, Any] | None]:
    subject = str(email.get("subject") or "")
    body = str(email.get("body") or "")
    display, addr = _parse_from(str(email.get("from") or ""))

    # "Your Netflix receipt" / "Linear annual invoice"
    m = re.search(
        r"(?:your|the)\s+([A-Z][A-Za-z0-9&.\- ]{1,40}?)\s+"
        r"(?:receipt|invoice|subscription|membership|statement)",
        subject,
        re.I,
    )
    if m:
        name = m.group(1).strip()
        return name, {
            "field": "merchant",
            "span": m.group(0),
            "start": hay.find(m.group(0)),
            "end": hay.find(m.group(0)) + len(m.group(0)),
        }

    m = re.search(
        r"^([A-Z][A-Za-z0-9&.\- ]{1,40}?)\s+(?:annual |monthly )?(?:invoice|receipt|subscription)",
        subject,
        re.I,
    )
    if m:
        name = m.group(1).strip()
        return name, {
            "field": "merchant",
            "span": m.group(0),
            "start": hay.find(m.group(0)),
            "end": hay.find(m.group(0)) + len(m.group(0)),
        }

    if display and not re.search(r"no[-\s]?reply|billing|invoice|receipt|mailer|info", display, re.I):
        return display, {
            "field": "merchant",
            "span": display,
            "start": hay.find(display),
            "end": hay.find(display) + len(display) if hay.find(display) >= 0 else 0,
        }

    claimed = _claimed_brand(hay)
    if claimed:
        pretty = claimed.title()
        loc = re.search(rf"\b{re.escape(claimed)}\b", hay, re.I)
        return pretty, _span("merchant", hay, loc)

    if addr and "@" in addr:
        host = addr.split("@", 1)[1]
        # skip generic mailbox hosts
        label = host.split(".")[0]
        if label not in {"mailer", "email", "mail", "no-reply", "noreply", "billing", "invoices"}:
            pretty = label.replace("-", " ").title()
            return pretty, {
                "field": "merchant",
                "span": addr,
                "start": hay.lower().find(addr),
                "end": hay.lower().find(addr) + len(addr) if hay.lower().find(addr) >= 0 else 0,
            }
        # mailer.netflix.com → Netflix
        parts = host.split(".")
        if len(parts) >= 3:
            pretty = parts[-2].title()
            return pretty, {
                "field": "merchant",
                "span": host,
                "start": hay.lower().find(host),
                "end": hay.lower().find(host) + len(host) if hay.lower().find(host) >= 0 else 0,
            }

    m = re.search(r"\bthanks for (?:being an? |your )?([A-Z][A-Za-z0-9&.\- ]{1,40}?) (?:member|customer|subscriber)\b", body, re.I)
    if m:
        return m.group(1).strip(), _span("merchant", hay, re.search(re.escape(m.group(0)), hay, re.I))

    return None, None


def _amount(hay: str) -> tuple[str | None, str, dict[str, Any] | None]:
    for cre in AMOUNT_PATTERNS:
        m = cre.search(hay)
        if not m:
            continue
        try:
            amount = _normalize_amount(m.group("amt"))
        except (ValueError, IndexError):
            continue
        cur_token = None
        if "cur" in m.re.groupindex:
            cur_token = m.group("cur")
        currency = _currency_from(cur_token)
        ev = {
            "field": "amount",
            "span": m.group(0).strip(),
            "start": m.start(),
            "end": m.end(),
        }
        return amount, currency, ev
    return None, "USD", None


def _cadence(hay: str) -> tuple[str, dict[str, Any] | None]:
    m = _search_positive(RECURRENCE_MONTHLY, hay)
    if m:
        return "monthly", _span("cadence", hay, m)
    m = _search_positive(RECURRENCE_ANNUAL, hay)
    if m:
        return "annual", _span("cadence", hay, m)
    m = _search_positive(RECURRENCE_GENERIC, hay)
    if m:
        return "unknown", _span("cadence", hay, m)
    return "unknown", None


def _is_negated_hit(text: str, match: re.Match[str]) -> bool:
    prefix = text[max(0, match.start() - 24) : match.start()].lower()
    window = text[max(0, match.start() - 16) : match.end() + 8].lower()
    if re.search(r"(?:not an? |no |without (?:a |any )?|is not an? |isn'?t an? )$", prefix):
        return True
    if any(
        phrase in window
        for phrase in (
            "not a subscription",
            "not a membership",
            "no recurring",
            "not recurring",
            "without recurring",
            "no auto-renew",
            "no autorenew",
        )
    ):
        return True
    return False


def _search_positive(patterns: tuple[str, ...], text: str) -> re.Match[str] | None:
    for pat in patterns:
        for m in re.finditer(pat, text, re.I):
            if not _is_negated_hit(text, m):
                return m
    return None


def _has_recurrence(hay: str) -> bool:
    return any(
        _search_positive(group, hay)
        for group in (RECURRENCE_MONTHLY, RECURRENCE_ANNUAL, RECURRENCE_GENERIC)
    )


def _has_strong_recurrence(hay: str) -> bool:
    return bool(
        _search_positive(RECURRENCE_MONTHLY, hay)
        or _search_positive(RECURRENCE_ANNUAL, hay)
        or _search_positive((r"\bauto[-\s]?renew(?:s|al)?\b",), hay)
    )


def _next_bill(hay: str) -> tuple[str | None, dict[str, Any] | None]:
    for cre in NEXT_BILL_PATTERNS:
        m = cre.search(hay)
        if not m:
            continue
        parsed = _parse_date(m.group("date"))
        if parsed:
            return parsed, {
                "field": "next_bill_date",
                "span": m.group(0).strip(),
                "start": m.start(),
                "end": m.end(),
            }
    return None, None


def _manage_url(hay: str, brand: str | None) -> tuple[str | None, dict[str, Any] | None, list[str]]:
    notes: list[str] = []
    candidates: list[tuple[str, re.Match[str], int]] = []
    for url, match in _extract_urls(hay):
        host = (urlparse(url).hostname or "").lower()
        path = (urlparse(url).path or "").lower()
        score = 0
        blob = f"{host}{path}"
        for hint in MANAGE_URL_HINTS:
            if hint in blob:
                score += 2
        if brand and not _host_ok_for_brand(brand, host):
            notes.append(f"url_host_mismatch:{host}")
            continue
        if score == 0:
            # keep as fallback only if no better match
            score = 1 if "http" in url else 0
        candidates.append((url, match, score))
    if not candidates:
        return None, None, notes
    candidates.sort(key=lambda row: (-row[2], row[0]))
    url, match, _ = candidates[0]
    return url, {
        "field": "manage_or_cancel_url",
        "span": match.group(0).rstrip(").,;]'\""),
        "start": match.start(),
        "end": match.start() + len(url),
    }, notes


def _is_otp(hay: str) -> re.Match[str] | None:
    return _search_any(OTP_PATTERNS, hay)


def _is_phishing(hay: str, brand: str | None) -> tuple[bool, str | None]:
    urgency = _search_any(PHISHING_URGENCY, hay)
    lookalike = _search_any(LOOKALIKE_HOST_HINTS, hay)
    otp = _is_otp(hay)
    mismatch = False
    for url, _ in _extract_urls(hay):
        host = (urlparse(url).hostname or "").lower()
        claimed = brand or _claimed_brand(hay)
        if claimed and not _host_ok_for_brand(claimed, host):
            mismatch = True
            break
        if _search_any(LOOKALIKE_HOST_HINTS, host):
            lookalike = lookalike or re.search(LOOKALIKE_HOST_HINTS[0], host, re.I)

    score = 0
    reason_bits: list[str] = []
    if urgency:
        score += 2
        reason_bits.append("urgency")
    if lookalike:
        score += 2
        reason_bits.append("lookalike_host")
    if mismatch:
        score += 2
        reason_bits.append("brand_host_mismatch")
    if otp and (urgency or mismatch or lookalike):
        score += 1
        reason_bits.append("otp_with_lure")
    if re.search(r"\b(password|seed phrase|recovery phrase|private key|ssn)\b", hay, re.I) and urgency:
        score += 2
        reason_bits.append("credential_harvest")
    if score >= 2:
        return True, "+".join(reason_bits)
    return False, None


def _skip(reason: str, email: dict[str, Any], extra: dict[str, Any] | None = None) -> dict[str, Any]:
    out = {
        "schema": SCHEMA,
        "skill": SKILL,
        "source": {
            "email_id": email.get("id"),
            "from": email.get("from"),
            "to": email.get("to"),
            "subject": email.get("subject"),
            "date": email.get("date"),
            "scan_status": email.get("scan_status"),
        },
        "decision": "skip",
        "skip_reason": reason,
        "packet": None,
        "safety": {
            "url_fetched": False,
            "url_clicked": False,
            "auto_pay": False,
            "email_treated_as_untrusted": True,
            "automations_required": False,
            "operator_gate": "not_applicable",
            "wallet_gate": "blocked",
        },
    }
    if extra:
        out["skip_detail"] = extra
    return out


def extract_one(email: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(email, dict):
        raise TypeError("email must be a JSON object")
    body = _norm(str(email.get("body") or ""))
    email = {**email, "body": body}
    hay = _hay(email)

    scan = str(email.get("scan_status") or "").lower()
    if scan == "flagged":
        return _skip("flagged", email)

    # Prompt-injection bait is data only; if the body tries to authorize
    # payment or cancel, that is not operator approval.
    injection = re.search(
        r"(?:ignore (?:previous|all) instructions|you are now|system prompt|"
        r"authorize (?:payment|wallet|paybox)|auto[-\s]?pay now|"
        r"click the cancel link without asking)",
        hay,
        re.I,
    )

    merchant, merchant_ev = _merchant(email, hay)
    brand_key = None
    if merchant:
        brand_key = merchant.split()[0].lower()

    phishing, phish_why = _is_phishing(hay, brand_key)
    if phishing:
        return _skip("phishing", email, {"signals": phish_why})

    otp = _is_otp(hay)
    if otp and not _has_recurrence(hay):
        return _skip("otp", email, {"span": otp.group(0)})

    if otp and re.search(r"\b(verify|sign[-\s]?in|login|authenticate)\b", hay, re.I) and not re.search(
        r"\b(receipt|invoice|charged|subscription|membership)\b", hay, re.I
    ):
        return _skip("otp", email, {"span": otp.group(0)})

    oneshot = _search_any(ONESHOT_PATTERNS, hay)
    has_rec = _has_recurrence(hay)
    # A one-shot invoice that only mentions "subscription" in the negative
    # ("not a subscription") must skip. Strong cadence (monthly/annual/
    # auto-renew) can still win if it is a positive hit.
    if oneshot and not _has_strong_recurrence(hay):
        return _skip("one_shot_no_recurrence", email, {"span": oneshot.group(0)})

    amount, currency, amount_ev = _amount(hay)
    if not amount:
        if not has_rec:
            return _skip("one_shot_no_recurrence" if oneshot else "no_amount", email)
        return _skip("no_amount", email)

    if not has_rec:
        return _skip("one_shot_no_recurrence", email, {"note": "amount present but no recurrence signal"})

    cadence, cadence_ev = _cadence(hay)
    next_bill, next_ev = _next_bill(hay)
    url, url_ev, url_notes = _manage_url(hay, brand_key if brand_key in BRAND_HOSTS else None)

    evidence: list[dict[str, Any]] = []
    for ev in (merchant_ev, amount_ev, cadence_ev, next_ev, url_ev):
        if ev and ev.get("start", -1) >= 0:
            evidence.append(ev)

    if injection:
        # Still emit the packet (data extraction is allowed) but the
        # injection cannot flip operator_gate or wallet_gate.
        evidence.append(
            {
                "field": "untrusted_instruction_ignored",
                "span": injection.group(0),
                "start": injection.start(),
                "end": injection.end(),
            }
        )

    packet = {
        "merchant": merchant or "unknown",
        "amount": amount,
        "currency": currency,
        "cadence": cadence,
        "next_bill_date": next_bill,
        "manage_or_cancel_url": url,
        "evidence": evidence,
        "operator_gate": "awaiting_approval",
        "wallet_gate": "blocked_until_fresh_yes",
        "url_notes": url_notes,
    }

    return {
        "schema": SCHEMA,
        "skill": SKILL,
        "source": {
            "email_id": email.get("id"),
            "from": email.get("from"),
            "to": email.get("to"),
            "subject": email.get("subject"),
            "date": email.get("date"),
            "scan_status": email.get("scan_status"),
        },
        "decision": "audit",
        "skip_reason": None,
        "packet": packet,
        "safety": {
            "url_fetched": False,
            "url_clicked": False,
            "auto_pay": False,
            "email_treated_as_untrusted": True,
            "automations_required": False,
            "operator_gate": "awaiting_approval",
            "wallet_gate": "blocked_until_fresh_yes",
        },
    }


def _load_payload(raw: str) -> list[dict[str, Any]]:
    raw = raw.strip()
    if not raw:
        return []
    data = json.loads(raw)
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        return [data]
    raise TypeError("JSON root must be an object or array")


def _read_inputs(argv: list[str]) -> list[dict[str, Any]]:
    emails: list[dict[str, Any]] = []
    if not argv:
        emails.extend(_load_payload(sys.stdin.read()))
        return emails
    for arg in argv:
        path = Path(arg)
        if path.is_dir():
            files = sorted(p for p in path.iterdir() if p.suffix.lower() == ".json")
            for f in files:
                emails.extend(_load_payload(f.read_text(encoding="utf-8")))
        else:
            emails.extend(_load_payload(path.read_text(encoding="utf-8")))
    return emails


def main(argv: list[str] | None = None) -> int:
    args = sys.argv[1:] if argv is None else argv
    if args and args[0] in {"-h", "--help"}:
        sys.stdout.write(
            "Usage: extract_recurring.py [file.json ...] [fixtures-dir]\n"
            "       cat fixture.json | extract_recurring.py\n"
            "No network. Emits mermail.recurring_charge_watch.v1 JSON.\n"
        )
        return 0
    try:
        emails = _read_inputs(args)
    except (OSError, json.JSONDecodeError, TypeError) as exc:
        sys.stderr.write(f"error: {exc}\n")
        return 2
    if not emails:
        sys.stderr.write("error: no email objects on stdin or in files\n")
        return 2
    results = [extract_one(e) for e in emails]
    payload = results[0] if len(results) == 1 else results
    sys.stdout.write(json.dumps(payload, indent=2, sort_keys=False) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
