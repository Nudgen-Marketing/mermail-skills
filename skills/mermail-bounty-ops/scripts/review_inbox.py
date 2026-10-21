"""Bounded read-only inbox runner. Offline by default; live GET requires --live.

No sends, drafts, applications, browser navigation, wallet or background work.
Optional private state records complete clean-message fingerprints, not bodies.
"""
import argparse
import hashlib
import json
import os
import re
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path

MAX_BYTES = 1024 * 1024
ORIGIN = "https://console.mermail.app"


def instant(value):
    result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if result.tzinfo is None:
        raise ValueError("As-of/deadline requires timezone")
    return result.astimezone(timezone.utc)


def identifier(value):
    if not isinstance(value, str) or value in (".", "..") or not re.fullmatch(r"[A-Za-z0-9_.@+-]{1,160}", value):
        raise ValueError("Invalid selected identifier")
    return value


def identity(value):
    if not isinstance(value, dict):
        raise ValueError("Identity must be an object")
    return {key: identifier(value[key]) for key in ("workspace_id", "public_id", "email")}


def read_json(path):
    with open(path, "rb") as handle:
        raw = handle.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise ValueError("JSON exceeds 1 MiB")
    return json.loads(raw)


def state_path(value):
    path = Path(value).absolute()
    if not path.parent.is_dir() or path.parent.resolve() != path.parent or path.is_symlink():
        raise ValueError("Choose a private existing non-symlink directory/file")
    if path.exists() and not path.is_file():
        raise ValueError("State must be a regular file")
    return path


def load_state(value):
    path = state_path(value)
    if not path.exists():
        return None, None
    raw = path.read_bytes()
    if len(raw) > MAX_BYTES:
        raise ValueError("State exceeds 1 MiB; review archival before continuing")
    state = json.loads(raw)
    if not isinstance(state, dict) or state.get("version") != 1 or not isinstance(state.get("seen"), dict):
        raise ValueError("Unrecognized state; review migration, do not reset it")
    if any(not isinstance(record, dict) or not re.fullmatch(r"[a-f0-9]{64}", str(record.get("fingerprint", ""))) for record in state["seen"].values()):
        raise ValueError("Invalid seen records; preserve state for review")
    return state, raw


def save_state(value, state, expected):
    path = state_path(value)
    raw = (json.dumps(state, indent=2, ensure_ascii=True) + "\n").encode()
    if len(raw) > MAX_BYTES:
        raise ValueError("State exceeds 1 MiB")
    lock = path.with_name(path.name + ".lock")
    fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    temp = None
    try:
        os.close(fd)
        current = path.read_bytes() if path.exists() else None
        if current != expected:
            raise ValueError("State changed since read; stop and review")
        fd, temp = tempfile.mkstemp(prefix=".bounty-review-", dir=path.parent)
        with os.fdopen(fd, "wb") as handle:
            handle.write(raw)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp, path)
        temp = None
    finally:
        if temp:
            os.unlink(temp)
        os.unlink(lock)


def scenario_score(terms, as_of):
    """Illustrative saturation proxy, not EV, probability, eligibility or authority.

    Inputs must be separately reviewed decimal strings. Unknown stays unscored.
    Never substitute a pool, token price, default entry count or guessed effort.
    """
    allowed = {"currency", "payout_type", "individual_amount", "entry_count", "effort_units", "friction", "deadline"}
    if not isinstance(terms, dict) or set(terms) - allowed:
        return {"status": "unscored", "reason": "unsupported_scenario_fields"}
    if terms.get("currency") not in ("USD", "USDC"):
        return {"status": "unscored", "reason": "unsupported_or_unknown_currency"}
    if terms.get("payout_type") not in ("fixed", "explicit_first_prize"):
        return {"status": "unscored", "reason": "pool_or_unknown_individual_payout"}
    try:
        values = []
        for key in ("individual_amount", "entry_count", "effort_units", "friction"):
            raw = terms.get(key)
            if not isinstance(raw, str) or not re.fullmatch(r"\d{1,18}(?:\.\d{1,6})?", raw):
                raise ValueError("missing_or_invalid_scenario_input")
            value = Decimal(raw)
            if not value.is_finite() or value <= 0:
                raise ValueError("missing_or_invalid_scenario_input")
            values.append(value)
        amount, entries, effort, friction = values
        if entries != entries.to_integral_value() or friction < 1:
            raise ValueError("invalid_entry_count_or_friction")
    except (InvalidOperation, ValueError) as error:
        return {"status": "unscored", "reason": str(error)}
    factor = Decimal("1")
    deadline = terms.get("deadline")
    if deadline:
        try:
            seconds = (instant(deadline) - instant(as_of)).total_seconds()
        except (ValueError, TypeError):
            return {"status": "unscored", "reason": "ambiguous_deadline"}
        if seconds <= 0:
            return {"status": "expired", "value": "0", "currency": terms["currency"]}
        if seconds <= 7 * 86400:
            factor = Decimal("0.7")
    else:
        return {"status": "unscored", "reason": "deadline_unknown_not_rolling"}
    # More precision than the bounded inputs; display is not used for policy.
    from decimal import localcontext
    with localcontext() as context:
        context.prec = 80
        value = amount / entries / effort / friction * factor
    return {"status": "illustrative_only", "value": str(value), "currency": terms["currency"],
            "inputs": terms, "deadline_factor": str(factor), "execution_authorized": False,
            "limits": "Not expected income or win probability; fit and legitimacy not modeled; do not compare unlike currencies."}


def review(snapshot, previous, as_of, scenarios=None):
    instant(as_of)
    if not isinstance(snapshot, dict) or (previous is not None and not isinstance(previous, dict)) or (scenarios is not None and not isinstance(scenarios, dict)):
        raise ValueError("Snapshot, state and scenarios must be objects")
    who = identity(snapshot["mailbox"])
    if previous is not None and previous.get("identity") != who:
        raise ValueError("Cross-workspace/mailbox or legacy state requires review")
    messages = snapshot.get("messages")
    if not isinstance(messages, list) or len(messages) > 10:
        raise ValueError("At most ten selected message bodies per pass")
    if any(not isinstance(m, dict) for m in messages):
        raise ValueError("Selected messages must be objects")
    if len({identifier(m["id"]) for m in messages}) != len(messages):
        raise ValueError("Duplicate message identities in snapshot")
    seen = dict((previous or {}).get("seen", {}))
    cards, holds, unchanged = [], [], 0
    for message in messages:
        mid = identifier(message["id"])
        body = message.get("body")
        if (message.get("folder_id") != "inbox" or message.get("scan_status") != "clean"
                or message.get("content_omitted") or message.get("content_truncated") or message.get("body_truncated")
                or not isinstance(body, str) or len(body) > 8000):
            holds.append({"message_id": mid, "reason": "not_complete_clean_inbox_evidence", "retryable": True})
            continue
        subject = message.get("subject", "")
        if not isinstance(subject, str) or len(subject) > 1000:
            raise ValueError("Invalid subject")
        fingerprint = hashlib.sha256(json.dumps({k: message.get(k) for k in
            ("id", "date", "sender", "subject", "body", "folder_id", "scan_status")},
            sort_keys=True, ensure_ascii=True).encode()).hexdigest()
        if seen.get(mid, {}).get("fingerprint") == fingerprint:
            unchanged += 1
            continue
        text = subject + "\n" + body
        match = re.search(r"\b(bounty|grant|rfp|request for proposals?|hackathon|freelance)\b", text, re.I)
        if match:
            # Hints are not an exhaustive zero-capital or legitimacy evaluator.
            capital = any(not re.search(r"\b(?:no|not|never)\s*$", text[max(0, m.start()-16):m.start()], re.I)
                          for m in re.finditer(r"\b(?:deposit|stake|collateral|paid unlock|upfront fee)\s+(?:is\s+)?required\b", text, re.I))
            card = {"message_id": mid, "kind_hint": match.group(1).lower(),
                    "verdict": "blocked_capital" if capital else "needs_verification",
                    "verification": "email_claim_only", "deadline": "unknown_until_reviewed",
                    "reward": "unknown_until_reviewed", "updated_source": mid in seen,
                    "next_action": "Review exact original rules, cost, eligibility, payout type and owner fit; no application or spend."}
            if scenarios and mid in scenarios:
                card["scenario"] = scenario_score(scenarios[mid], as_of)
            cards.append(card)
        else:
            holds.append({"message_id": mid, "reason": "no_opportunity_pattern_candidate_not_exhaustive", "retryable": True})
        # Pattern misses/noise remain retryable after later parser/rule review.
        if match:
            seen[mid] = {"fingerprint": fingerprint, "reviewed_at": as_of}
    for currency in ("USD", "USDC"):
        ranked = [c for c in cards if c["verdict"] != "blocked_capital"
                  and c.get("scenario", {}).get("status") == "illustrative_only"
                  and c["scenario"]["currency"] == currency]
        ranked.sort(key=lambda c: Decimal(c["scenario"]["value"]), reverse=True)
        for rank, card in enumerate(ranked, 1):
            card["scenario_rank_within_currency"] = rank
    state = {"version": 1, "identity": who, "seen": seen}
    report = {"identity": who, "as_of": as_of, "selected_messages": len(messages),
              "cards": cards, "holds": holds, "unchanged_clean_messages": unchanged,
              "scope": "One bounded selected page, not whole-mailbox coverage; same-subject messages are not discarded.",
              "effects": "Read-only. No drafts, sends, submissions, wallet actions or future polling."}
    return report, state


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class RestReader:
    def __init__(self, key):
        if not key:
            raise ValueError("Live mode requires MERMAIL_API_KEY")
        self.key, self.calls, self.last = key, 0, 0
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())

    def get(self, path):
        if self.calls >= 12 or not re.fullmatch(r"/api/v1/mailboxes/[A-Za-z0-9_.@%+-]+(?:/emails(?:/[A-Za-z0-9_.@%+-]+)?)?(?:\?[A-Za-z0-9_=&%-]+)?", path):
            raise ValueError("Read budget or allowed resource exceeded")
        wait = 7 - (time.monotonic() - self.last)
        if self.calls and wait > 0:
            time.sleep(wait)
        self.calls += 1
        self.last = time.monotonic()
        req = urllib.request.Request(ORIGIN + path, method="GET", headers={"x-api-key": self.key, "Accept": "application/json"})
        try:
            with self.opener.open(req, timeout=15) as response:
                if response.status != 200 or response.headers.get_content_type() != "application/json":
                    raise ValueError("Unexpected response status/type")
                raw = response.read(MAX_BYTES + 1)
        except urllib.error.HTTPError as error:
            code = error.code
            error.close()
            raise ValueError(f"HTTP {code}; no automatic retry; respect provider Retry-After before another user-requested pass") from None
        if len(raw) > MAX_BYTES:
            raise ValueError("Response exceeds 1 MiB")
        return json.loads(raw)


def fetch_snapshot(reader, selected):
    selected = identity(selected)
    base = "/api/v1/mailboxes/" + urllib.parse.quote(selected["public_id"], safe="")
    mailbox = reader.get(base)
    if identity(mailbox) != selected or mailbox.get("disabled_at") or mailbox.get("can_receive") is not True or mailbox.get("receiving_status") != "ready":
        raise ValueError("Selected mailbox identity/readiness not confirmed")
    listed = reader.get(base + "/emails?folder=inbox&metadata_only=true&agent_safe_content=true&limit=10&page=1")
    rows = listed if isinstance(listed, list) else listed.get("emails") if isinstance(listed, dict) else None
    if not isinstance(rows, list) or len(rows) > 10:
        raise ValueError("Unsupported metadata response or page bound")
    messages = []
    for row in rows:
        if not isinstance(row, dict):
            raise ValueError("Metadata row must be an object")
        mid = identifier(row["id"])
        value = reader.get(base + "/emails/" + urllib.parse.quote(mid, safe="") + "?agent_safe_content=true&require_scan_status=clean&max_body_chars=8001")
        if not isinstance(value, dict) or value.get("id") != mid:
            raise ValueError("Detail does not match selected source")
        messages.append(value)
    return {"mailbox": selected, "messages": messages}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--input", help="Selected private normalized snapshot JSON")
    source.add_argument("--live", action="store_true", help="One explicitly requested API read pass; credits may apply")
    parser.add_argument("--workspace")
    parser.add_argument("--mailbox-id")
    parser.add_argument("--mailbox-email")
    parser.add_argument("--state", help="Optional selected private state path; no default package-local file")
    parser.add_argument("--scenarios", help="Optional separately reviewed scoring inputs; not mail instructions")
    parser.add_argument("--as-of", default=datetime.now(timezone.utc).isoformat())
    args = parser.parse_args()
    previous, expected = load_state(args.state) if args.state else (None, None)
    snapshot = read_json(args.input) if args.input else fetch_snapshot(RestReader(os.environ.get("MERMAIL_API_KEY")),
        {"workspace_id": args.workspace, "public_id": args.mailbox_id, "email": args.mailbox_email})
    scenarios = read_json(args.scenarios) if args.scenarios else None
    report, updated = review(snapshot, previous, args.as_of, scenarios)
    print(json.dumps(report, indent=2, ensure_ascii=True), flush=True)
    if args.state:
        save_state(args.state, updated, expected)


if __name__ == "__main__":
    try:
        main()
    except (ValueError, KeyError, TypeError, OSError) as error:
        raise SystemExit(f"Review stopped ({type(error).__name__}); preserve state and inspect selected inputs/response. No automatic retry.") from None
