#!/usr/bin/env python3
"""Telegram approval card for one Mermail reply draft (Python 3 standard library only).

The script never calls Mermail. The agent drafts with Mermail MCP tools, pipes one
draft JSON object into this script, and sends the reply only when the script exits 0
with ``decision: "approve"`` and a hash that matches the exact payload being sent.

Usage:
  tg_approval.py [--draft-file PATH]          # post card, wait for a decision (stdin if no file)
  tg_approval.py --hash-only [--draft-file P] # print the approval hash of a payload
  tg_approval.py --render-only [--draft-file] # print the Telegram messages without sending
  tg_approval.py --check                      # verify bot token and chat configuration
  tg_approval.py --notify "text"              # post one plain status line to the allowed chat
  tg_approval.py --self-test                  # run offline unit tests with a mocked Bot API

Environment:
  TELEGRAM_BOT_TOKEN       Bot API token (never printed or logged)
  TELEGRAM_ALLOWED_CHAT_ID Only chat whose callbacks/messages are accepted
  TELEGRAM_ALLOWED_USER_ID Optional; only user allowed to decide (defaults to the chat id,
                           which equals the user id in a private chat with the bot)

Exit codes: 0 approve | 10 reject | 20 timeout | 2 usage/config error | 3 Telegram/API error.
Every non-zero exit means: do not send.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import os
import secrets
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

API_BASE = "https://api.telegram.org"
CALLBACK_PREFIX = "mta1"
MAX_MESSAGE_CHARS = 3800  # Telegram limit is 4096 after entity parsing; keep headroom.
MAX_EDIT_CHARS = 10000
MAX_CONTEXT_CHARS = 400
EXIT_APPROVE, EXIT_REJECT, EXIT_TIMEOUT, EXIT_USAGE, EXIT_API = 0, 10, 20, 2, 3
DECISION_EXIT = {"approve": EXIT_APPROVE, "reject": EXIT_REJECT, "timeout": EXIT_TIMEOUT}


class ConfigError(Exception):
    """Invalid input or environment."""


class TelegramError(Exception):
    """Bot API failure. Messages are always token-redacted."""


# --------------------------------------------------------------------------- payload


def _recipients(value) -> list[str]:
    if value is None or value == "":
        return []
    if isinstance(value, str):
        value = value.split(",")
    if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
        raise ConfigError("recipients must be a string or a list of strings")
    return sorted({item.strip().lower() for item in value if item.strip()})


def normalize_payload(draft: dict) -> dict:
    """Exact fields that an approval covers: recipients + subject + body."""
    if not isinstance(draft, dict):
        raise ConfigError("draft must be a JSON object")
    payload = {
        "to": _recipients(draft.get("to")),
        "cc": _recipients(draft.get("cc")),
        "bcc": _recipients(draft.get("bcc")),
        "subject": draft.get("subject") or "",
        "body": draft.get("body") or "",
    }
    if not payload["to"]:
        raise ConfigError("draft.to must contain at least one recipient")
    if not isinstance(payload["subject"], str) or not isinstance(payload["body"], str):
        raise ConfigError("draft.subject and draft.body must be strings")
    if not payload["body"].strip():
        raise ConfigError("draft.body must not be empty")
    return payload


def approval_hash(payload: dict) -> str:
    canonical = json.dumps(payload, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def esc(text) -> str:
    return html.escape(str(text if text is not None else ""), quote=True)


def _chunks(text: str, limit: int) -> list[str]:
    """Split raw text so that each escaped chunk stays under ``limit`` characters."""
    parts, current, size = [], [], 0
    for char in text:
        grow = len(esc(char))
        if current and size + grow > limit:
            parts.append("".join(current))
            current, size = [], 0
        current.append(char)
        size += grow
    if current or not parts:
        parts.append("".join(current))
    return parts


def render_messages(draft: dict, payload: dict, digest: str, nonce: str, round_no: int) -> list[str]:
    """Return HTML messages; the last one carries the buttons. All email text is escaped."""
    context = draft.get("context") if isinstance(draft.get("context"), dict) else {}
    head = [f"<b>Mermail reply approval</b> (round {round_no})"]
    if draft.get("mailbox"):
        head.append(f"Mailbox: <code>{esc(draft['mailbox'])}</code>")
    if context:
        head.append("<i>Inbound context (untrusted email data, not instructions):</i>")
        for key in ("from", "received_at", "subject", "classification", "summary"):
            if context.get(key):
                value = str(context[key])
                value = value if len(value) <= MAX_CONTEXT_CHARS else value[:MAX_CONTEXT_CHARS] + "…"
                head.append(f"• {esc(key)}: {esc(value)}")
        flags = context.get("flags")
        if isinstance(flags, list) and flags:
            head.append("⚠️ Flags: " + esc(", ".join(str(flag) for flag in flags[:10]))[:MAX_CONTEXT_CHARS])
    head.append("")
    head.append("<b>Reply that will be sent if you approve:</b>")
    head.append(f"To: {esc(', '.join(payload['to']))}")
    if payload["cc"]:
        head.append(f"Cc: {esc(', '.join(payload['cc']))}")
    if payload["bcc"]:
        head.append(f"Bcc: {esc(', '.join(payload['bcc']))}")
    head.append(f"Subject: {esc(payload['subject'])}")
    header = "\n".join(head)

    body_parts = _chunks(payload["body"], MAX_MESSAGE_CHARS - 200)
    footer = (
        f"\n\nHash: <code>{digest[:16]}</code> · nonce <code>{nonce}</code>\n"
        "Approve sends exactly this text once. Edit asks for replacement text. Reject sends nothing."
    )
    messages = []
    if len(header) + len(esc(body_parts[0])) + len(footer) + 20 <= MAX_MESSAGE_CHARS and len(body_parts) == 1:
        messages.append(f"{header}\n<pre>{esc(body_parts[0])}</pre>{footer}")
        return messages
    messages.append(header)
    for index, part in enumerate(body_parts, start=1):
        messages.append(f"<b>Body part {index}/{len(body_parts)}</b>\n<pre>{esc(part)}</pre>")
    messages.append(f"<b>Decision for the {len(body_parts)}-part body above</b>{footer}")
    return messages


def keyboard(nonce: str) -> dict:
    return {
        "inline_keyboard": [[
            {"text": "✅ Approve", "callback_data": f"{CALLBACK_PREFIX}:approve:{nonce}"},
            {"text": "✏️ Edit", "callback_data": f"{CALLBACK_PREFIX}:edit:{nonce}"},
            {"text": "❌ Reject", "callback_data": f"{CALLBACK_PREFIX}:reject:{nonce}"},
        ]]
    }


# --------------------------------------------------------------------------- Bot API


class TelegramClient:
    def __init__(self, token: str, timeout: float = 40.0):
        if not token or ":" not in token:
            raise ConfigError("TELEGRAM_BOT_TOKEN is missing or malformed")
        self._token = token
        self._timeout = timeout

    def _redact(self, text: str) -> str:
        return str(text).replace(self._token, "<redacted>")

    def call(self, method: str, **params):
        url = f"{API_BASE}/bot{self._token}/{method}"
        data = json.dumps(params).encode("utf-8")
        request = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(request, timeout=self._timeout) as response:
                result = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:  # never print error.url: it contains the token
            try:
                detail = json.loads(error.read().decode("utf-8")).get("description", "")
            except Exception:  # noqa: BLE001 - best-effort diagnostics only
                detail = ""
            raise TelegramError(self._redact(f"{method} failed: HTTP {error.code} {detail}")) from None
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            reason = getattr(error, "reason", error)
            raise TelegramError(self._redact(f"{method} failed: {reason}")) from None
        if not result.get("ok"):
            raise TelegramError(self._redact(f"{method} failed: {result.get('description', 'unknown error')}"))
        return result.get("result")


# --------------------------------------------------------------------------- approval loop


class ApprovalDesk:
    def __init__(self, client, chat_id: int, user_id: int, *, clock=time.monotonic,
                 poll_seconds: int = 25, log=None):
        self.client = client
        self.chat_id = chat_id
        self.user_id = user_id
        self.clock = clock
        self.poll_seconds = poll_seconds
        self.offset = None
        self.log = log or (lambda message: print(message, file=sys.stderr))

    # -- helpers
    def _send(self, text: str, markup: dict | None = None, force_reply: bool = False) -> int:
        params = {
            "chat_id": self.chat_id,
            "text": text,
            "parse_mode": "HTML",
            "link_preview_options": {"is_disabled": True},  # never preflight links from email
        }
        if markup:
            params["reply_markup"] = markup
        elif force_reply:
            params["reply_markup"] = {"force_reply": True, "selective": True}
        return self.client.call("sendMessage", **params)["message_id"]

    def _close_card(self, message_id: int, note: str) -> None:
        try:
            self.client.call("editMessageReplyMarkup", chat_id=self.chat_id, message_id=message_id,
                             reply_markup={"inline_keyboard": []})
            self._send(esc(note))
        except TelegramError as error:
            self.log(f"warning: could not close card: {error}")

    def _answer(self, callback_id: str, text: str) -> None:
        try:
            self.client.call("answerCallbackQuery", callback_query_id=callback_id, text=text)
        except TelegramError as error:
            self.log(f"warning: answerCallbackQuery failed: {error}")

    def _status(self, what: str, deadline: float) -> None:
        """One human-readable stderr line (no secrets, no email text) so a waiting agent is not silent."""
        until = datetime.now().astimezone() + timedelta(seconds=max(0.0, deadline - self.clock()))
        self.log(f"{what}, waiting for decision until {until:%H:%M} {until:%Z}".rstrip())

    def _authorized(self, sender: dict | None, chat: dict | None) -> bool:
        return bool(sender and chat and sender.get("id") == self.user_id and chat.get("id") == self.chat_id)

    def prime_offset(self) -> None:
        """Skip updates that existed before this card so stale taps/messages never count."""
        updates = self.client.call("getUpdates", offset=-1, timeout=0, allowed_updates=["message", "callback_query"])
        self.offset = (updates[-1]["update_id"] + 1) if updates else None

    def _updates(self, deadline: float):
        remaining = int(deadline - self.clock())
        if remaining <= 0:
            return []
        params = {"timeout": max(1, min(self.poll_seconds, remaining)),
                  "allowed_updates": ["message", "callback_query"]}
        if self.offset is not None:
            params["offset"] = self.offset
        updates = self.client.call("getUpdates", **params) or []
        if updates:
            self.offset = updates[-1]["update_id"] + 1
        return updates

    # -- waits
    def wait_for_button(self, nonce: str, card_id: int, deadline: float):
        while self.clock() < deadline:
            for update in self._updates(deadline):
                callback = update.get("callback_query")
                if not callback:
                    continue
                message = callback.get("message") or {}
                data = str(callback.get("data") or "")
                parts = data.split(":")
                if len(parts) != 3 or parts[0] != CALLBACK_PREFIX:
                    continue
                if not self._authorized(callback.get("from"), message.get("chat")):
                    self.log("ignored callback from an unauthorized user or chat")
                    self._answer(callback.get("id", ""), "Not authorized for this approval.")
                    continue
                if parts[2] != nonce or message.get("message_id") != card_id:
                    self._answer(callback.get("id", ""), "This card is stale or already used.")
                    continue
                if parts[1] not in ("approve", "edit", "reject"):
                    continue
                self._answer(callback.get("id", ""), f"Recorded: {parts[1]}")
                return parts[1], callback["from"]["id"]
        return "timeout", None

    def wait_for_text(self, deadline: float):
        while self.clock() < deadline:
            for update in self._updates(deadline):
                message = update.get("message")
                if not message or "text" not in message:
                    continue
                if not self._authorized(message.get("from"), message.get("chat")):
                    self.log("ignored message from an unauthorized user or chat")
                    continue
                text = message["text"]
                if text.strip().lower() in ("/cancel", "cancel"):
                    return "cancel", None
                return "text", text[:MAX_EDIT_CHARS]
        return "timeout", None

    # -- main flow
    def run(self, draft: dict, timeout: float, edit_timeout: float, max_edits: int) -> dict:
        payload = normalize_payload(draft)
        original_hash = approval_hash(payload)
        deadline = self.clock() + timeout
        edited_body = None
        self.prime_offset()
        for round_no in range(1, max_edits + 2):
            digest = approval_hash(payload)
            nonce = secrets.token_hex(8)
            messages = render_messages(draft, payload, digest, nonce, round_no)
            for text in messages[:-1]:
                self._send(text)
            card_id = self._send(messages[-1], markup=keyboard(nonce))
            self._status(f"card posted (round {round_no}, hash {digest[:16]})", deadline)
            decision, actor = self.wait_for_button(nonce, card_id, deadline)
            result = {"decision": decision, "hash": digest, "nonce": nonce,
                      "original_hash": original_hash, "edited": edited_body is not None,
                      "rounds": round_no, "draft_id": draft.get("draft_id"),
                      "source_email_id": draft.get("source_email_id"),
                      "decided_by": actor,
                      "decided_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}
            if edited_body is not None:
                result["edited_body"] = edited_body
            if decision == "approve":
                self._close_card(card_id, f"Approved (hash {digest[:16]}). The agent may send this exact text once.")
                return result
            if decision == "reject":
                self._close_card(card_id, "Rejected. Nothing will be sent.")
                return result
            if decision == "timeout":
                self._close_card(card_id, "Expired without a decision. Nothing will be sent.")
                return result
            # decision == "edit"
            self._close_card(card_id, "Edit requested.")
            if round_no > max_edits:
                result["decision"] = "reject"
                result["reason"] = "edit limit reached"
                self._send("Edit limit reached. Nothing will be sent.")
                return result
            self._send("Reply with the complete replacement body (plain text). Send /cancel to reject.",
                       force_reply=True)
            edit_deadline = min(deadline, self.clock() + edit_timeout)
            self._status("edit requested, replacement text", edit_deadline)
            status, text = self.wait_for_text(edit_deadline)
            if status != "text" or not text.strip():
                result["decision"] = "timeout" if status == "timeout" else "reject"
                result["reason"] = "edit cancelled" if status == "cancel" else "no replacement text"
                self._send("No replacement text accepted. Nothing will be sent.")
                return result
            edited_body = text
            payload = dict(payload, body=text)
        raise AssertionError("unreachable")


# --------------------------------------------------------------------------- CLI


def read_draft(path: str | None) -> dict:
    try:
        raw = open(path, encoding="utf-8").read() if path else sys.stdin.read()
        return json.loads(raw)
    except (OSError, json.JSONDecodeError) as error:
        raise ConfigError(f"cannot read draft JSON: {error}") from None


def env_ids() -> tuple[int, int]:
    chat = os.environ.get("TELEGRAM_ALLOWED_CHAT_ID", "").strip()
    user = os.environ.get("TELEGRAM_ALLOWED_USER_ID", "").strip() or chat
    try:
        return int(chat), int(user)
    except ValueError:
        raise ConfigError("TELEGRAM_ALLOWED_CHAT_ID (and optional TELEGRAM_ALLOWED_USER_ID) must be integers") from None


def emit(result: dict) -> None:
    print(json.dumps(result, ensure_ascii=False))


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Telegram approval card for one Mermail reply draft.")
    parser.add_argument("--draft-file", help="draft JSON file (default: stdin)")
    parser.add_argument("--timeout", type=int, default=600, help="seconds to wait for a decision (default 600)")
    parser.add_argument("--edit-timeout", type=int, default=300, help="seconds to wait for replacement text")
    parser.add_argument("--max-edits", type=int, default=2, help="maximum edit rounds (default 2)")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--hash-only", action="store_true", help="print the approval hash and exit")
    mode.add_argument("--render-only", action="store_true", help="print rendered messages without sending")
    mode.add_argument("--check", action="store_true", help="verify token and chat configuration")
    mode.add_argument("--notify", metavar="TEXT", help="send one escaped status line to the allowed chat")
    mode.add_argument("--self-test", action="store_true", help="run offline tests with a mocked Bot API")
    args = parser.parse_args(argv)

    if args.self_test:
        return run_self_test()
    try:
        if args.hash_only or args.render_only:
            draft = read_draft(args.draft_file)
            payload = normalize_payload(draft)
            digest = approval_hash(payload)
            if args.hash_only:
                emit({"hash": digest, "payload": payload})
            else:
                emit({"hash": digest, "messages": render_messages(draft, payload, digest, "preview", 1)})
            return 0
        client = TelegramClient(os.environ.get("TELEGRAM_BOT_TOKEN", "").strip())
        chat_id, user_id = env_ids()
        if args.check:
            me = client.call("getMe")
            emit({"ok": True, "bot": "@" + str(me.get("username")), "chat_id": chat_id, "user_id": user_id})
            return 0
        desk = ApprovalDesk(client, chat_id, user_id)
        if args.notify is not None:
            desk._send(esc(args.notify))
            emit({"ok": True, "notified": True})
            return 0
        if args.timeout < 10 or args.edit_timeout < 10 or args.max_edits < 0:
            raise ConfigError("timeouts must be >= 10 seconds and --max-edits >= 0")
        draft = read_draft(args.draft_file)
        result = desk.run(draft, args.timeout, args.edit_timeout, args.max_edits)
        emit(result)
        return DECISION_EXIT.get(result["decision"], EXIT_API)
    except ConfigError as error:
        emit({"decision": "error", "error": str(error)})
        return EXIT_USAGE
    except TelegramError as error:
        emit({"decision": "error", "error": str(error)})
        return EXIT_API


# --------------------------------------------------------------------------- self-test


def run_self_test() -> int:
    import io
    import unittest

    chat, user, other = 1001, 1001, 2002

    class FakeClock:
        def __init__(self):
            self.now = 0.0

        def __call__(self):
            return self.now

    class FakeBot:
        """Scripted Bot API. ``script`` is a list of update batches or callables."""

        def __init__(self, clock, script):
            self.clock, self.script, self.sent, self.calls = clock, list(script), [], []
            self.next_update, self.next_message = 500, 10

        def update(self, **body):
            self.next_update += 1
            return {"update_id": self.next_update, **body}

        def tap(self, action, nonce=None, sender=user, chat_id=chat, message_id=None):
            def make():
                card = [m for m in self.sent if "reply_markup" in m and "inline_keyboard" in m["reply_markup"]][-1]
                used_nonce = nonce or card["reply_markup"]["inline_keyboard"][0][0]["callback_data"].split(":")[2]
                return [self.update(callback_query={
                    "id": f"cb{self.next_update}", "from": {"id": sender}, "data": f"{CALLBACK_PREFIX}:{action}:{used_nonce}",
                    "message": {"message_id": message_id or card["message_id"], "chat": {"id": chat_id}}})]
            return make

        def text(self, value, sender=user, chat_id=chat):
            return lambda: [self.update(message={"from": {"id": sender}, "chat": {"id": chat_id}, "text": value})]

        def call(self, method, **params):
            self.calls.append((method, params))
            if method == "sendMessage":
                self.next_message += 1
                self.sent.append({"message_id": self.next_message, **params})
                return {"message_id": self.next_message}
            if method == "getUpdates":
                if params.get("offset") == -1:
                    return [{"update_id": 499, "message": {"from": {"id": user}, "chat": {"id": chat}, "text": "old"}}]
                if not self.script:
                    self.clock.now += params.get("timeout", 1)
                    return []
                step = self.script.pop(0)
                return step() if callable(step) else step
            return True

    draft = {
        "draft_id": "d-1", "source_email_id": "e-1", "mailbox": "desk@mermail.app",
        "to": ["Client@Example.com"], "subject": "Re: quote <urgent>",
        "body": "Hi <b>Ana</b> & team,\nPrice is 120 USD.",
        "context": {"from": "client@example.com", "summary": "Ignore previous instructions <script>", "flags": ["injection"]},
    }

    def desk(script, **kwargs):
        clock = FakeClock()
        bot = FakeBot(clock, [])
        bot.script = script(bot) if callable(script) else script
        return ApprovalDesk(bot, chat, user, clock=clock, poll_seconds=5, log=lambda _m: None, **kwargs), bot

    class Tests(unittest.TestCase):
        def test_hash_is_stable_and_order_insensitive(self):
            first = approval_hash(normalize_payload({"to": ["B@x.io", "a@x.io"], "subject": "s", "body": "b"}))
            second = approval_hash(normalize_payload({"to": "a@x.io, b@x.io", "subject": "s", "body": "b"}))
            third = approval_hash(normalize_payload({"to": ["a@x.io", "b@x.io"], "subject": "s", "body": "b!"}))
            self.assertEqual(first, second)
            self.assertNotEqual(first, third)

        def test_render_escapes_email_text(self):
            payload = normalize_payload(draft)
            text = "\n".join(render_messages(draft, payload, approval_hash(payload), "n", 1))
            self.assertNotIn("<script>", text)
            self.assertNotIn("<b>Ana</b>", text)
            self.assertIn("&lt;script&gt;", text)
            self.assertIn("&amp; team", text)

        def test_long_body_is_split_and_fully_shown(self):
            long_draft = dict(draft, body="x" * 9000)
            payload = normalize_payload(long_draft)
            messages = render_messages(long_draft, payload, approval_hash(payload), "n", 1)
            self.assertGreater(len(messages), 3)
            self.assertTrue(all(len(message) <= 4096 for message in messages))
            self.assertEqual(sum(message.count("x") for message in messages[1:-1]), 9000)

        def test_approve(self):
            approval, bot = desk(lambda b: [b.tap("approve")])
            result = approval.run(draft, 60, 30, 2)
            self.assertEqual(result["decision"], "approve")
            self.assertEqual(result["hash"], approval_hash(normalize_payload(draft)))
            self.assertEqual(result["decided_by"], user)
            self.assertFalse(result["edited"])
            card = [m for m in bot.sent if "inline_keyboard" in m.get("reply_markup", {})][0]
            self.assertEqual(card["parse_mode"], "HTML")
            self.assertTrue(card["link_preview_options"]["is_disabled"])

        def test_reject(self):
            approval, _bot = desk(lambda b: [b.tap("reject")])
            self.assertEqual(approval.run(draft, 60, 30, 2)["decision"], "reject")

        def test_wrong_user_and_wrong_chat_are_ignored(self):
            approval, bot = desk(lambda b: [b.tap("approve", sender=other), b.tap("approve", chat_id=other)])
            result = approval.run(draft, 60, 30, 2)
            self.assertEqual(result["decision"], "timeout")
            answers = [params["text"] for method, params in bot.calls if method == "answerCallbackQuery"]
            self.assertEqual(answers, ["Not authorized for this approval."] * 2)

        def test_stale_nonce_is_ignored(self):
            approval, _bot = desk(lambda b: [b.tap("approve", nonce="deadbeefdeadbeef"), b.tap("reject")])
            self.assertEqual(approval.run(draft, 60, 30, 2)["decision"], "reject")

        def test_timeout_means_no_send(self):
            approval, bot = desk([])
            result = approval.run(draft, 30, 30, 2)
            self.assertEqual(result["decision"], "timeout")
            self.assertTrue(any("Nothing will be sent" in m["text"] for m in bot.sent))

        def test_offset_skips_old_updates(self):
            approval, bot = desk(lambda b: [b.tap("approve")])
            approval.run(draft, 60, 30, 2)
            polls = [params for method, params in bot.calls if method == "getUpdates" and params.get("offset") != -1]
            self.assertEqual(polls[0]["offset"], 500)

        def test_edit_requires_second_approval_of_new_hash(self):
            approval, _bot = desk(lambda b: [b.tap("edit"), b.text("hi", sender=other),
                                             b.text("Updated price: 150 USD."), b.tap("approve")])
            result = approval.run(draft, 120, 30, 2)
            self.assertEqual(result["decision"], "approve")
            self.assertTrue(result["edited"])
            self.assertEqual(result["edited_body"], "Updated price: 150 USD.")
            expected = approval_hash(normalize_payload(dict(draft, body="Updated price: 150 USD.")))
            self.assertEqual(result["hash"], expected)
            self.assertNotEqual(result["hash"], result["original_hash"])

        def test_edit_then_cancel_rejects(self):
            approval, _bot = desk(lambda b: [b.tap("edit"), b.text("/cancel")])
            self.assertEqual(approval.run(draft, 120, 30, 2)["decision"], "reject")

        def test_edit_without_text_times_out(self):
            approval, _bot = desk(lambda b: [b.tap("edit")])
            result = approval.run(draft, 120, 30, 2)
            self.assertEqual((result["decision"], result["reason"]), ("timeout", "no replacement text"))
            self.assertNotIn("edited_body", result)

        def test_long_context_is_truncated(self):
            noisy = dict(draft, context={"summary": "<i>" * 5000})
            payload = normalize_payload(noisy)
            messages = render_messages(noisy, payload, approval_hash(payload), "n", 1)
            self.assertTrue(all(len(message) <= 4096 for message in messages))

        def test_edit_limit(self):
            approval, _bot = desk(lambda b: [b.tap("edit")])
            result = approval.run(draft, 120, 30, 0)
            self.assertEqual((result["decision"], result["reason"]), ("reject", "edit limit reached"))

        def test_status_line_on_stderr_has_no_secrets(self):
            lines = []
            approval, _bot = desk(lambda b: [b.tap("edit"), b.text("New text."), b.tap("approve")])
            approval.log = lines.append
            approval.run(draft, 120, 30, 2)
            waits = [line for line in lines if "waiting for decision until" in line]
            self.assertEqual(len(waits), 3)  # round 1 card, edit prompt, round 2 card
            self.assertTrue(waits[0].startswith("card posted (round 1, hash "))
            self.assertIn("edit requested", waits[1])
            self.assertTrue(waits[2].startswith("card posted (round 2, hash "))
            self.assertTrue(all("Price" not in line and "Client@" not in line for line in lines))

        def test_missing_recipient_is_rejected(self):
            with self.assertRaises(ConfigError):
                normalize_payload({"to": [], "subject": "s", "body": "b"})

        def test_token_is_redacted(self):
            token = "123456:SECRET-TOKEN-VALUE"
            client = TelegramClient(token)

            def boom(*_args, **_kwargs):
                raise urllib.error.URLError(f"cannot reach {API_BASE}/bot{token}/getMe")

            original = urllib.request.urlopen
            urllib.request.urlopen = boom
            try:
                with self.assertRaises(TelegramError) as caught:
                    client.call("getMe")
            finally:
                urllib.request.urlopen = original
            self.assertNotIn("SECRET-TOKEN-VALUE", str(caught.exception))
            self.assertIn("<redacted>", str(caught.exception))

        def test_cli_hash_only(self):
            stdin, stdout = sys.stdin, sys.stdout
            sys.stdin, sys.stdout = io.StringIO(json.dumps(draft)), io.StringIO()
            try:
                code = main(["--hash-only"])
                output = json.loads(sys.stdout.getvalue())
            finally:
                sys.stdin, sys.stdout = stdin, stdout
            self.assertEqual(code, 0)
            self.assertEqual(output["hash"], approval_hash(normalize_payload(draft)))

    suite = unittest.defaultTestLoader.loadTestsFromTestCase(Tests)
    outcome = unittest.TextTestRunner(stream=sys.stderr, verbosity=2).run(suite)
    return 0 if outcome.wasSuccessful() else 1


if __name__ == "__main__":
    sys.exit(main())
