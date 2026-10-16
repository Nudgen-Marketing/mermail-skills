import argparse
import hashlib
import json
import re
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path


OWNER_KEY = "mailbox"
MONTHS = {
    name: number
    for number, name in enumerate(
        (
            "January",
            "February",
            "March",
            "April",
            "May",
            "June",
            "July",
            "August",
            "September",
            "October",
            "November",
            "December",
        ),
        1,
    )
}
WEEKDAYS = {
    name: number
    for number, name in enumerate(
        (
            "Monday",
            "Tuesday",
            "Wednesday",
            "Thursday",
            "Friday",
            "Saturday",
            "Sunday",
        )
    )
}

PROMISE_PATTERNS = (
    re.compile(r"\bI(?:'ll| will)\b", re.IGNORECASE),
    re.compile(r"\bwe(?:'ll| will)\b", re.IGNORECASE),
    re.compile(
        r"\bI(?:'m| am) (?:sending|sharing|preparing)\b", re.IGNORECASE
    ),
)
REQUEST_PATTERNS = (
    re.compile(
        r"\bplease\b[^.?!]*\b(send|share|review|confirm|provide|deliver)\b",
        re.IGNORECASE,
    ),
    re.compile(r"\bcould you\b", re.IGNORECASE),
    re.compile(r"\bcan you\b", re.IGNORECASE),
)
RECEIPT_PATTERN = re.compile(
    r"\breceived\b[^.!?]*\bthank|\bgot it, thanks\b|\bthank you, received\b",
    re.IGNORECASE,
)
DELIVERY_PATTERN = re.compile(
    r"\bhere (?:is|'s) the\b|\battached\b|\bsent you\b|\bdelivered\b|\bas promised\b",
    re.IGNORECASE,
)


def _as_datetime(value):
    if isinstance(value, datetime):
        result = value
    else:
        text = str(value)
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        result = datetime.fromisoformat(text)
    if result.tzinfo is None:
        result = result.replace(tzinfo=timezone.utc)
    return result.astimezone(timezone.utc)


def _iso_datetime(value):
    return _as_datetime(value)


def _normalize_text(text):
    return re.sub(r"\s+", " ", text).strip()


def _newest_content(body):
    lines = str(body or "").splitlines()
    kept = []
    for line in lines:
        if line.startswith(">") or re.match(r"^On .+ wrote:$", line):
            break
        if line == "--":
            break
        kept.append(line)
    return "\n".join(kept)


def _sentences(body):
    content = _newest_content(body)
    parts = re.findall(r"[^.!?\n]+(?:[.!?]|$)", content)
    return [_normalize_text(part) for part in parts if _normalize_text(part)]


def load_inbox(path):
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def parse_deadline(text, msg_date):
    message_date = _as_datetime(msg_date).date()
    value = str(text)

    iso_match = re.search(r"\b(20\d{2})-(\d{2})-(\d{2})\b", value)
    if iso_match:
        try:
            return date(
                int(iso_match.group(1)),
                int(iso_match.group(2)),
                int(iso_match.group(3)),
            )
        except ValueError:
            return None

    month_match = re.search(
        r"\b(?:by )?(January|February|March|April|May|June|July|August|"
        r"September|October|November|December) (\d{1,2})\b",
        value,
        re.IGNORECASE,
    )
    if month_match:
        month = MONTHS[month_match.group(1).capitalize()]
        try:
            result = date(message_date.year, month, int(month_match.group(2)))
        except ValueError:
            return None
        if result < message_date and (message_date - result).days > 180:
            result = date(result.year + 1, result.month, result.day)
        return result

    weekday_match = re.search(
        r"\bby (Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b",
        value,
        re.IGNORECASE,
    )
    if weekday_match:
        target = WEEKDAYS[weekday_match.group(1).capitalize()]
        days = (target - message_date.weekday()) % 7
        if days == 0:
            days = 7
        return message_date + timedelta(days=days)

    lowered = value.lower()
    if re.search(r"\btomorrow\b", lowered):
        return message_date + timedelta(days=1)
    if re.search(r"\bnext week\b", lowered):
        return message_date + timedelta(days=7)
    if re.search(r"\btoday\b|\bend of day\b|\beod\b", lowered):
        return message_date
    if re.search(r"\bend of week\b", lowered):
        if message_date.weekday() <= 4:
            return message_date + timedelta(days=4 - message_date.weekday())
        return message_date + timedelta(days=4 - message_date.weekday() + 7)
    return None


def _matches(patterns, text):
    return any(pattern.search(text) for pattern in patterns)


def _counterparty(message, owner):
    sender = message.get("from", "")
    if sender.lower() != owner.lower():
        return sender
    recipients = message.get("to") or []
    for recipient in recipients:
        if recipient.lower() != owner.lower():
            return recipient
    return recipients[0] if recipients else ""


def _message_is_outbound(message, owner):
    return message.get("from", "").lower() == owner.lower()


def _item_id(thread_id, text):
    digest = hashlib.sha1(
        (thread_id + "|" + text).encode("utf-8")
    ).hexdigest()
    return digest[:12]


def _make_item(thread, message, text, item_type, subtype, owner):
    deadline = parse_deadline(text, message["date"])
    is_promise = item_type == "owed_by_me" or (
        item_type == "owed_to_me" and subtype == "promise"
    )
    if is_promise:
        # Explicit promise: high with a deadline, medium without.
        confidence = "high" if deadline else "medium"
    else:
        # Requests and open questions: medium with a deadline, low without.
        confidence = "medium" if deadline else "low"

    ball = "me" if item_type in ("owed_by_me", "waiting_on_me") else "them"
    return {
        "id": _item_id(thread["id"], text),
        "type": item_type,
        "subtype": subtype,
        "thread_id": thread["id"],
        "subject": thread.get("subject", ""),
        "counterparty": _counterparty(message, owner),
        "text": text,
        "source_message_id": message["id"],
        "created_at": message["date"],
        "deadline": deadline.isoformat() if deadline else None,
        "confidence": confidence,
        "status": "open",
        "last_activity_at": thread["_last_activity_at"],
        "ball": ball,
        "evidence_message_id": None,
    }


def extract_items(inbox, now):
    owner = inbox["mailbox"]["email"]
    items = []

    for original_thread in inbox.get("threads", []):
        thread = dict(original_thread)
        messages = sorted(
            thread.get("messages", []),
            key=lambda message: _as_datetime(message["date"]),
        )
        if not messages:
            continue
        thread["_last_activity_at"] = messages[-1]["date"]
        thread_items = []

        for message in messages:
            outbound = _message_is_outbound(message, owner)
            for sentence in _sentences(message.get("body", "")):
                has_promise = _matches(PROMISE_PATTERNS, sentence)
                has_request = _matches(REQUEST_PATTERNS, sentence)

                if outbound and has_promise:
                    thread_items.append(
                        _make_item(
                            thread,
                            message,
                            sentence,
                            "owed_by_me",
                            None,
                            owner,
                        )
                    )
                elif not outbound and has_promise:
                    thread_items.append(
                        _make_item(
                            thread,
                            message,
                            sentence,
                            "owed_to_me",
                            "promise",
                            owner,
                        )
                    )

                if has_request:
                    if outbound:
                        thread_items.append(
                            _make_item(
                                thread,
                                message,
                                sentence,
                                "owed_to_me",
                                "asked",
                                owner,
                            )
                        )
                    else:
                        thread_items.append(
                            _make_item(
                                thread,
                                message,
                                sentence,
                                "waiting_on_me",
                                None,
                                owner,
                            )
                        )

        thread_items.sort(key=lambda item: _as_datetime(item["created_at"]))

        for item in thread_items:
            item_time = _as_datetime(item["created_at"])
            if item["type"] == "waiting_on_me":
                later_promise = any(
                    other["type"] == "owed_by_me"
                    and _as_datetime(other["created_at"]) > item_time
                    for other in thread_items
                )
                if later_promise:
                    item["status"] = "accepted"

            if item["type"] == "owed_to_me" and item["subtype"] == "asked":
                later_promise = any(
                    other["type"] == "owed_to_me"
                    and other["subtype"] == "promise"
                    and _as_datetime(other["created_at"]) > item_time
                    for other in thread_items
                )
                if later_promise:
                    item["status"] = "answered"

        for item in thread_items:
            is_promise_item = item["type"] == "owed_by_me" or (
                item["type"] == "owed_to_me" and item["subtype"] == "promise"
            )
            if item["status"] != "open" or not is_promise_item:
                continue

            owing_party = (
                owner
                if item["type"] == "owed_by_me"
                else item["counterparty"]
            )
            item_time = _as_datetime(item["created_at"])
            for message in messages:
                message_time = _as_datetime(message["date"])
                if message_time <= item_time:
                    continue
                sender = message.get("from", "").lower()
                content = _newest_content(message.get("body", ""))
                delivered = sender == owing_party.lower() and (
                    bool(message.get("attachments"))
                    or DELIVERY_PATTERN.search(content)
                )
                confirmed = sender != owing_party.lower() and (
                    RECEIPT_PATTERN.search(content)
                )
                if delivered or confirmed:
                    item["status"] = "fulfilled"
                    item["evidence_message_id"] = message["id"]
                    break

        current_date = _as_datetime(now).date()
        for item in thread_items:
            if item["status"] == "open" and item["type"] in (
                "owed_by_me",
                "owed_to_me",
            ):
                if item["deadline"] and date.fromisoformat(
                    item["deadline"]
                ) < current_date:
                    item["status"] = "overdue"

        items.extend(thread_items)

    return items


def urgency_score(item, now):
    if item["status"] in ("fulfilled", "accepted", "answered"):
        return 0

    current = _as_datetime(now)
    score = 0
    deadline = (
        date.fromisoformat(item["deadline"]) if item.get("deadline") else None
    )
    if deadline and current.date() > deadline:
        days_overdue = (current.date() - deadline).days
        score += 50 + min(30, 5 * days_overdue)
    elif deadline and (deadline - current.date()).days <= 3:
        score += 30

    days_since = max(
        0, (current - _as_datetime(item["last_activity_at"])).days
    )
    if item["ball"] == "them":
        score += min(25, 2 * days_since)
    elif item["status"] in ("open", "overdue"):
        score += min(15, days_since)

    if deadline:
        score += 10
    if item.get("confidence") == "high":
        score += 10
    return min(100, score)


def _age_text(item, now):
    current = _as_datetime(now)
    deadline = (
        date.fromisoformat(item["deadline"]) if item.get("deadline") else None
    )
    if deadline and current.date() > deadline:
        return f"{(current.date() - deadline).days}d overdue"
    days = max(
        0, (current - _as_datetime(item["last_activity_at"])).days
    )
    return f"{days}d silent"


def _brief_line(item, now):
    if item["status"] == "fulfilled":
        age = "fulfilled"
    else:
        age = _age_text(item, now)
    due = item["deadline"] or "no date"
    return (
        f"- [{urgency_score(item, now)}] {item['text']} — "
        f"{item['counterparty']} · thread `{item['thread_id']}` · "
        f"source `{item['source_message_id']}` · due {due} · "
        f"{age}"
    )


def render_briefing(ledger, now):
    items = ledger.get("items", [])
    sections = [
        (
            "## Overdue",
            [
                item for item in items
                if item["status"] == "overdue"
                and item["type"] in ("owed_by_me", "owed_to_me")
            ],
        ),
        (
            "## Waiting on others",
            [
                item for item in items
                if item["type"] == "owed_to_me"
                and item["status"] == "open"
            ],
        ),
        (
            "## Waiting on you",
            [
                item for item in items
                if (
                    item["type"] == "waiting_on_me"
                    and item["status"] == "open"
                )
                or (
                    item["type"] == "owed_by_me"
                    and item["status"] == "open"
                )
            ],
        ),
        (
            "## Recently fulfilled",
            [
                item for item in items if item["status"] == "fulfilled"
            ],
        ),
    ]

    output = []
    for heading, selected in sections:
        output.append(heading)
        selected.sort(
            key=lambda item: urgency_score(item, now),
            reverse=True,
        )
        if selected:
            for item in selected:
                line = _brief_line(item, now)
                if item["status"] == "fulfilled":
                    line += f" · evidence `{item['evidence_message_id']}`"
                output.append(line)
        else:
            output.append("None.")
        output.append("")
    return "\n".join(output).rstrip() + "\n"


def render_nudges(ledger, now):
    candidates = [
        item
        for item in ledger.get("items", [])
        if item["type"] == "owed_to_me"
        and item["status"] in ("open", "overdue")
        and item["confidence"] in ("high", "medium")
        and (
            item["status"] == "overdue"
            or (
                item["ball"] == "them"
                and (
                    _as_datetime(now)
                    - _as_datetime(item["last_activity_at"])
                ).days >= 4
            )
        )
    ]
    candidates.sort(key=lambda item: urgency_score(item, now), reverse=True)

    chosen = []
    seen_threads = set()
    for item in candidates:
        if item["thread_id"] in seen_threads:
            continue
        seen_threads.add(item["thread_id"])
        chosen.append(item)

    output = []
    for item in chosen:
        deadline = item["deadline"] or "no date"
        output.extend(
            [
                f"### Draft nudge — {item['subject']} "
                f"(thread {item['thread_id']})",
                f"To: {item['counterparty']}",
                "",
                (
                    f"Hello, following up on your promise, "
                    f"\"{item['text']}\" from {item['created_at']} "
                    f"(deadline: {deadline}). Could you please share an "
                    f"update when convenient?"
                ),
                "",
                "DRAFT ONLY — save with save_draft; do not send without approval.",
                "",
            ]
        )
    return "\n".join(output).rstrip() + ("\n" if output else "")


def _parse_now(value):
    return _as_datetime(value) if value else datetime.now(timezone.utc)


def _scan(args):
    now = _parse_now(args.now)
    inbox = load_inbox(args.inbox)
    items = extract_items(inbox, now)
    ledger = {
        "mailbox": inbox["mailbox"]["email"],
        "generated_at": now.isoformat().replace("+00:00", "Z"),
        "items": items,
    }
    with open(args.ledger, "w", encoding="utf-8") as handle:
        json.dump(ledger, handle, indent=2)
        handle.write("\n")

    counts = {}
    for item in items:
        key = f"{item['type']}={item['status']}"
        counts[key] = counts.get(key, 0) + 1
    summary = ", ".join(
        f"{key}:{counts[key]}" for key in sorted(counts)
    )
    print(f"Scanned {len(items)} items" + (f" ({summary})" if summary else ""))


def _brief(args):
    now = _parse_now(args.now)
    with open(args.ledger, "r", encoding="utf-8") as handle:
        ledger = json.load(handle)
    sys.stdout.write(render_briefing(ledger, now))


def _nudges(args):
    now = _parse_now(args.now)
    with open(args.ledger, "r", encoding="utf-8") as handle:
        ledger = json.load(handle)
    sys.stdout.write(render_nudges(ledger, now))


def main():
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)

    scan_parser = subparsers.add_parser("scan")
    scan_parser.add_argument("--inbox", required=True)
    scan_parser.add_argument("--ledger", required=True)
    scan_parser.add_argument("--now")
    scan_parser.set_defaults(handler=_scan)

    brief_parser = subparsers.add_parser("brief")
    brief_parser.add_argument("--ledger", required=True)
    brief_parser.add_argument("--now")
    brief_parser.set_defaults(handler=_brief)

    nudges_parser = subparsers.add_parser("nudges")
    nudges_parser.add_argument("--ledger", required=True)
    nudges_parser.add_argument("--now")
    nudges_parser.set_defaults(handler=_nudges)

    args = parser.parse_args()
    args.handler(args)


if __name__ == "__main__":
    main()
