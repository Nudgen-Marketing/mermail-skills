#!/usr/bin/env python3
"""mermail-local-worker: run [WORK] task-card emails on a local LLM endpoint.

Minimal, dependency-free reference implementation for the
``mermail-local-worker`` skill. Reads Mermail through the hosted MCP server
(streamable HTTP JSON-RPC), polls a designated mailbox for ``[WORK]`` task
cards within a bounded budget, parses each card as DATA ONLY, runs the task
text against a user-hosted OpenAI-compatible ``/v1/chat/completions`` endpoint
(Ollama / LM Studio / vLLM / llama.cpp), and replies the result in-thread via
``reply_to_email`` after explicit confirmation.

Safety properties:
- no proxy env vars are honoured (urllib ProxyHandler({}))
- bounded polling: at most ``MERMAIL_WORKER_POLL_MAX`` attempts inside
  ``MERMAIL_WORKER_POLL_WINDOW_SECONDS``
- idempotent: one ``[DONE]`` reply per ``idempotency_key``, ever
- card bodies are parsed as data; the task text only ever reaches the local
  model as chat content, never a shell
- the reply is an external effect: it prints an exact preview and requires
  ``--yes`` (or a stdin confirmation) before sending

Usage:
    python3 local_worker.py --mailbox-id <public_id>            # live run
    python3 local_worker.py --self-test                          # built-in mock test
    python3 local_worker.py --dry-run --mailbox-id m1            # poll for real, print instead of send
Environment:
    MERMAIL_API_KEY (required for live runs), MERMAIL_MCP_URL,
    MERMAIL_LOCAL_LLM_BASE_URL, MERMAIL_LOCAL_LLM_MODEL, MERMAIL_LOCAL_LLM_API_KEY
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

DEFAULT_MCP_URL = "https://console.mermail.app/mcp"
DEFAULT_LLM_BASE_URL = "http://localhost:11434/v1"
WORK_PREFIX = "[WORK]"
DONE_PREFIX = "[DONE]"
BODY_CHAR_LIMIT = 10_000
DEFAULT_POLL_MAX = 5
DEFAULT_POLL_WINDOW_SECONDS = 120
# No proxy support on purpose: mailbox content must not transit an env proxy.
_OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))
_TIMEOUT = 30


class WorkerError(Exception):
    """Stable worker failure state."""


# ---------------------------------------------------------------- HTTP layer


def http_post_json(url: str, payload: dict, headers: dict | None = None) -> dict | None:
    """POST JSON, return parsed JSON. Returns None for 2xx with an empty body.

    Raises WorkerError on HTTP errors so callers can stop on 401/402/403/429.
    """
    data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(url, data=data, method="POST")
    request.add_header("Content-Type", "application/json")
    request.add_header("Accept", "application/json, text/event-stream")
    for key, value in (headers or {}).items():
        request.add_header(key, value)
    try:
        with _OPENER.open(request, timeout=_TIMEOUT) as response:
            raw = response.read().decode("utf-8", errors="replace")
            content_type = response.headers.get("Content-Type", "")
            session_id = response.headers.get("Mcp-Session-Id")
    except urllib.error.HTTPError as exc:
        raise WorkerError(f"http_{exc.code}") from exc
    except urllib.error.URLError as exc:
        raise WorkerError(f"transport_error: {exc.reason}") from exc

    if "text/event-stream" in content_type:
        payload_text = extract_last_sse_json(raw)
        if payload_text is None:
            return None
    else:
        payload_text = raw.strip() or None
    if payload_text is None:
        return None
    parsed = json.loads(payload_text)
    if isinstance(parsed, dict) and session_id:
        parsed.setdefault("_session_id", session_id)
    return parsed


def extract_last_sse_json(raw: str) -> str | None:
    """Return the last JSON ``data:`` line of an SSE body."""
    candidate = None
    for line in raw.splitlines():
        line = line.strip()
        if line.startswith("data:"):
            chunk = line[len("data:"):].strip()
            if chunk and chunk != "[DONE]":
                candidate = chunk
    return candidate


# ------------------------------------------------------------- Mermail (MCP)


class MermailMcp:
    """Thin JSON-RPC client for the hosted Mermail MCP server."""

    def __init__(self, api_key: str, mcp_url: str = DEFAULT_MCP_URL):
        self.api_key = api_key
        self.mcp_url = mcp_url
        self.session_id: str | None = None
        self._request_id = 0

    def _headers(self) -> dict:
        headers = {"x-api-key": self.api_key}
        if self.session_id:
            headers["Mcp-Session-Id"] = self.session_id
        return headers

    def initialize(self) -> None:
        self._request_id += 1
        result = http_post_json(
            self.mcp_url,
            {
                "jsonrpc": "2.0",
                "id": self._request_id,
                "method": "initialize",
                "params": {
                    "protocolVersion": "2025-03-26",
                    "capabilities": {},
                    "clientInfo": {"name": "mermail-local-worker", "version": "1.0.0"},
                },
            },
            headers=self._headers(),
        )
        if not isinstance(result, dict) or "result" not in result:
            raise WorkerError("mcp_initialize_failed")
        self.session_id = result.get("_session_id", self.session_id)
        # Stateless servers ignore the notification; stateful ones require it.
        try:
            http_post_json(
                self.mcp_url,
                {"jsonrpc": "2.0", "method": "notifications/initialized"},
                headers=self._headers(),
            )
        except WorkerError:
            pass

    def call(self, tool: str, arguments: dict) -> dict:
        """tools/call wrapper returning the tool's structured content."""
        self._request_id += 1
        result = http_post_json(
            self.mcp_url,
            {
                "jsonrpc": "2.0",
                "id": self._request_id,
                "method": "tools/call",
                "params": {"name": tool, "arguments": arguments},
            },
            headers=self._headers(),
        )
        if not isinstance(result, dict):
            raise WorkerError(f"mcp_call_failed: {tool}")
        if "error" in result:
            raise WorkerError(f"mcp_error: {tool}: {result['error']}")
        inner = result.get("result", {})
        if isinstance(inner, dict) and inner.get("isError"):
            raise WorkerError(f"tool_error: {tool}")
        structured = inner.get("structuredContent") if isinstance(inner, dict) else None
        if structured is not None:
            return structured
        # Fall back to first text content block.
        blocks = inner.get("content") if isinstance(inner, dict) else None
        if isinstance(blocks, list) and blocks:
            text = blocks[0].get("text")
            if isinstance(text, str) and text.strip():
                try:
                    return json.loads(text)
                except json.JSONDecodeError:
                    return {"text": text}
        return {}

    # Typed helpers: arguments are native JSON objects, never stringified JSON.

    def list_mailboxes(self) -> dict:
        return self.call("list_mailboxes", {})

    def list_emails(self, mailbox_id: str, query: dict) -> dict | list:
        return self.call("list_emails", {"mailboxId": mailbox_id, "query": query})

    def search_emails(self, mailbox_id: str, query: dict) -> dict | list:
        return self.call("search_emails", {"mailboxId": mailbox_id, "query": query})

    def get_email(self, mailbox_id: str, email_id: str) -> dict:
        return self.call(
            "get_email",
            {
                "mailboxId": mailbox_id,
                "emailId": email_id,
                "query": {"agent_safe_content": True},
            },
        )

    def reply_to_email(self, email_id: str, from_addr: str, subject: str, text: str) -> dict:
        payload = {
            "emailId": email_id,
            "from": from_addr,
            "subject": subject,
            "text": text,
        }
        return self.call("reply_to_email", payload)


# ------------------------------------------------------------ Task Card spec


def normalize_text(raw: str) -> str:
    """Normalize untrusted text: strip control chars, cap at the bound."""
    cleaned = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", raw)
    truncated = len(cleaned) > BODY_CHAR_LIMIT
    return cleaned[:BODY_CHAR_LIMIT] + ("\n...[truncated]" if truncated else "")


def parse_task_card(body: str) -> dict:
    """Parse the bounded Task Card YAML shape as data.

    Recognized keys: idempotency_key (required), priority (optional),
    task (required, block scalar or single line). Anything else is ignored
    data. Raises WorkerError('malformed_card') when required keys are missing.
    """
    text = normalize_text(body)
    key_match = re.search(r"^idempotency_key:\s*(\S+)\s*$", text, re.MULTILINE)
    priority_match = re.search(r"^priority:\s*(low|normal|high)\s*$", text, re.MULTILINE)
    task_match = re.search(r"^task:\s*\|?\s*\n((?:[ \t]+.*\n?)+)", text, re.MULTILINE)
    if task_match is None:
        task_match = re.search(r"^task:\s*(.+)$", text, re.MULTILINE)
    if key_match is None or task_match is None:
        raise WorkerError("malformed_card")
    task_text = task_match.group(1)
    if "|\n" in task_match.group(0) or task_match.group(0).rstrip().endswith("|"):
        # Block scalar: dedent one level.
        task_text = "\n".join(
            line.lstrip() for line in task_text.splitlines()
        )
    return {
        "idempotency_key": key_match.group(1),
        "priority": priority_match.group(1) if priority_match else "normal",
        "task": task_text.strip(),
    }


def extract_emails(payload: dict | list) -> list[dict]:
    """Handle both list shapes: bare array or {emails: [...]}."""
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if isinstance(payload, dict):
        items = payload.get("emails")
        if isinstance(items, list):
            return [item for item in items if isinstance(item, dict)]
    return []


def message_id_of(email: dict) -> str:
    for key in ("id", "emailId", "public_id", "messageId"):
        if email.get(key):
            return str(email[key])
    return ""


# ------------------------------------------------------------------- Worker


class LocalWorker:
    def __init__(self, mermail: MermailMcp, args, llm_fn=None):
        self.mermail = mermail
        self.mailbox_id = args.mailbox_id
        self.poll_max = int(os.environ.get("MERMAIL_WORKER_POLL_MAX", DEFAULT_POLL_MAX))
        self.poll_window = int(
            os.environ.get("MERMAIL_WORKER_POLL_WINDOW_SECONDS", DEFAULT_POLL_WINDOW_SECONDS)
        )
        self.llm_base_url = os.environ.get("MERMAIL_LOCAL_LLM_BASE_URL", DEFAULT_LLM_BASE_URL).rstrip("/")
        self.llm_model = os.environ.get("MERMAIL_LOCAL_LLM_MODEL", "")
        self.llm_api_key = os.environ.get("MERMAIL_LOCAL_LLM_API_KEY", "")
        self.dry_run = args.dry_run
        self.llm_fn = llm_fn if llm_fn is not None else self._http_llm_call
        self.processed_keys: set[str] = set()
        self.results: list[dict] = []

    # -- bounded poll -------------------------------------------------------

    def poll_for_cards(self) -> list[dict]:
        """Bounded poll: <= poll_max attempts inside poll_window seconds."""
        deadline = time.monotonic() + self.poll_window
        cards: list[dict] = []
        for attempt in range(1, self.poll_max + 1):
            payload = self.safe_search(WORK_PREFIX)
            candidates = [
                email
                for email in extract_emails(payload)
                if str(email.get("subject", "")).startswith(WORK_PREFIX)
            ]
            for candidate in candidates:
                card = self.load_card(candidate)
                if card is not None:
                    cards.append(card)
            if cards or attempt == self.poll_max:
                return cards
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                return cards
            time.sleep(min(30.0, max(1.0, remaining / self.poll_max)))
        return cards

    def safe_search(self, subject: str) -> dict | list:
        try:
            return self.mermail.search_emails(
                self.mailbox_id,
                {"subject": subject, "page": 1, "limit": 25},
            )
        except WorkerError as exc:
            message = str(exc)
            if any(code in message for code in ("401", "402", "403", "429")):
                raise
            return []  # transient search failure: empty page, budget still ticks

    def load_card(self, candidate: dict) -> dict | None:
        email_id = message_id_of(candidate)
        if not email_id:
            return None
        try:
            full = self.mermail.get_email(self.mailbox_id, email_id)
        except WorkerError as exc:
            self.results.append({"email_id": email_id, "state": f"blocked_read: {exc}"})
            return None
        body = full.get("body") or full.get("text") or full.get("bodyText") or ""
        if isinstance(body, dict):
            body = body.get("text", "")
        try:
            card = parse_task_card(str(body))
        except WorkerError:
            self.results.append({"email_id": email_id, "state": "malformed"})
            return None
        card["email_id"] = email_id
        card["subject"] = str(candidate.get("subject", ""))
        return card

    # -- idempotency --------------------------------------------------------

    def already_replied(self, card: dict) -> bool:
        if card["idempotency_key"] in self.processed_keys:
            return True
        try:
            payload = self.safe_search(DONE_PREFIX)
        except WorkerError:
            return False
        for email in extract_emails(payload):
            subject = str(email.get("subject", ""))
            if subject.startswith(DONE_PREFIX) and card["idempotency_key"] in subject:
                return True
        return False

    # -- local inference ----------------------------------------------------

    def _http_llm_call(self, payload: dict) -> dict:
        headers = {}
        if self.llm_api_key:
            headers["Authorization"] = f"Bearer {self.llm_api_key}"
        return http_post_json(f"{self.llm_base_url}/chat/completions", payload, headers)

    def run_local_inference(self, task_text: str) -> str:
        payload = {
            "model": self.llm_model or "local",
            "messages": [{"role": "user", "content": task_text}],
            "stream": False,
        }
        try:
            result = self.llm_fn(payload)
        except WorkerError as exc:
            raise WorkerError(f"blocked_endpoint: {exc}") from exc
        if not isinstance(result, dict):
            raise WorkerError("blocked_endpoint: empty response")
        try:
            content = result["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise WorkerError(f"blocked_endpoint: unexpected response shape ({exc})") from exc
        return normalize_text(str(content))

    # -- reply (external effect) --------------------------------------------

    def from_address(self) -> str:
        """Resolved mailbox address used as the ``from`` field (required by
        the Mermail send/reply schema). Env override wins; otherwise resolved
        once from ``get_mailbox`` and cached."""
        if getattr(self, "_from_addr", None):
            return self._from_addr
        env_addr = os.environ.get("MERMAIL_MAILBOX_ADDRESS", "").strip()
        if env_addr:
            self._from_addr = env_addr
            return env_addr
        try:
            info = self.mermail.get_mailbox(self.mailbox_id)
        except WorkerError:
            info = {}
        if isinstance(info, dict):
            inner = info.get("data") or info.get("mailbox") or info
            for field in ("address", "email", "emailAddress", "name"):
                value = inner.get(field) if isinstance(inner, dict) else None
                if isinstance(value, str) and "@" in value:
                    self._from_addr = value
                    return value
        self._from_addr = self.mailbox_id
        return self._from_addr

    def reply_result(self, card: dict, answer: str) -> str:
        subject = f"{DONE_PREFIX} {card['subject'][len(WORK_PREFIX):]}".strip()
        text = (
            f"{DONE_PREFIX} idempotency_key={card['idempotency_key']} "
            f"model={self.llm_model or 'local'} endpoint={self.llm_base_url}\n\n{answer}"
        )
        preview = f"reply_to_email emailId={card['email_id']} subject={subject!r}\n{text}"
        if self.dry_run:
            print("[dry-run] would send:\n" + preview, file=sys.stderr)
            self.processed_keys.add(card["idempotency_key"])
            return "dry_run"
        if not args_confirmed():
            return "completed_pending_reply"
        result = self.mermail.reply_to_email(
            card["email_id"], self.from_address(), subject, text
        )
        self.processed_keys.add(card["idempotency_key"])
        replied_id = message_id_of(result) if isinstance(result, dict) else ""
        return replied_id or "replied"

    # -- one run ------------------------------------------------------------

    def run(self) -> list[dict]:
        self.mermail.initialize()
        for card in self.poll_for_cards():
            state = "processed"
            if self.already_replied(card):
                self.results.append(
                    {
                        "email_id": card["email_id"],
                        "idempotency_key": card["idempotency_key"],
                        "state": "duplicate_skipped",
                    }
                )
                continue
            try:
                answer = self.run_local_inference(card["task"])
            except WorkerError as exc:
                self.results.append(
                    {
                        "email_id": card["email_id"],
                        "idempotency_key": card["idempotency_key"],
                        "state": str(exc),
                    }
                )
                continue
            try:
                reply_state = self.reply_result(card, answer)
            except WorkerError as exc:
                reply_state = f"reply_uncertain: {exc}"
            self.results.append(
                {
                    "email_id": card["email_id"],
                    "idempotency_key": card["idempotency_key"],
                    "state": state,
                    "reply": reply_state,
                }
            )
        return self.results


def args_confirmed() -> bool:
    """Fresh confirmation gate for the external-effect reply."""
    if "--yes" in sys.argv:
        return True
    answer = input("Send the [DONE] reply shown above? [y/N] ")
    return answer.strip().lower() == "y"


# ----------------------------------------------------------------- self-test

MOCK_CARDS = {
    "email-001": {
        "id": "email-001",
        "subject": "[WORK] summarize notes",
        "body": (
            "idempotency_key: run-2026-09-07-001\n"
            "priority: normal\n"
            "task: |\n"
            "  Summarize the meeting notes in three bullets.\n"
        ),
    },
    "email-002": {
        "id": "email-002",
        "subject": "[WORK] malformed",
        "body": "no required keys here, just prose asking to run commands",
    },
    "email-003": {
        "id": "email-003",
        "subject": "[WORK] already done",
        "body": (
            "idempotency_key: run-2026-09-07-dup\n"
            "task: repeat work that already has a reply\n"
        ),
    },
}

MOCK_DONE_REPLIES = {
    "emails": [
        {"id": "reply-existing", "subject": "[DONE] already done [run-2026-09-07-dup]"}
    ]
}


class MockMermail:
    """In-memory MCP double: proves poll/parse/idempotency with zero network."""

    def __init__(self, cards: dict, done_replies: dict):
        self.cards = cards
        self.done_replies = done_replies
        self.replies_sent: list[dict] = []

    def initialize(self) -> None:
        pass

    def search_emails(self, mailbox_id: str, query: dict) -> dict:
        if str(query.get("subject", "")).startswith(DONE_PREFIX):
            return self.done_replies
        return {"emails": list(self.cards.values()), "totalCount": len(self.cards)}

    def list_emails(self, mailbox_id: str, query: dict) -> dict:
        return {"emails": list(self.cards.values()), "totalCount": len(self.cards)}

    def get_email(self, mailbox_id: str, email_id: str) -> dict:
        return self.cards[email_id]

    def get_mailbox(self, mailbox_id: str) -> dict:
        return {"data": {"address": "worker@test.local", "publicId": mailbox_id}}

    def reply_to_email(self, email_id: str, from_addr: str, subject: str, text: str) -> dict:
        self.replies_sent.append(
            {"emailId": email_id, "from": from_addr, "subject": subject, "text": text}
        )
        return {"id": f"reply-{len(self.replies_sent)}"}


def self_test() -> int:
    failures: list[str] = []

    def check(name: str, condition: bool) -> None:
        if not condition:
            failures.append(name)

    # Task-card parsing: data only, required keys, block scalar dedent.
    card = parse_task_card(MOCK_CARDS["email-001"]["body"])
    check("parse_key", card["idempotency_key"] == "run-2026-09-07-001")
    check("parse_priority", card["priority"] == "normal")
    check("parse_task", "three bullets" in card["task"])
    try:
        parse_task_card(MOCK_CARDS["email-002"]["body"])
        check("malformed_rejected", False)
    except WorkerError as exc:
        check("malformed_rejected", "malformed_card" in str(exc))

    # Normalization: control chars stripped, bound enforced.
    check("normalize_controls", "\x07" not in normalize_text("a\x07b"))
    check("normalize_bound", len(normalize_text("x" * (BODY_CHAR_LIMIT + 5000))) <= BODY_CHAR_LIMIT + 20)

    # SSE extraction.
    sse = 'event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"ok":true}}\n\n'
    check("sse_json", json.loads(extract_last_sse_json(sse))["result"]["ok"] is True)

    # End-to-end mock run: bounded poll, dedup, one reply only.
    os.environ["MERMAIL_LOCAL_LLM_BASE_URL"] = "http://localhost:11434/v1"
    os.environ["MERMAIL_LOCAL_LLM_MODEL"] = "test-local-model"

    def mock_llm(payload: dict) -> dict:
        captured["payload"] = payload
        return {"choices": [{"message": {"content": "mock local answer"}}]}

    captured: dict = {}

    def build_worker(mermail, dry_run: bool) -> LocalWorker:
        return LocalWorker(
            mermail,
            argparse.Namespace(mailbox_id="mb-1", dry_run=dry_run),
            llm_fn=mock_llm,
        )

    # Dry run: poll/parse/infer run, but nothing is sent.
    dry = build_worker(MockMermail(MOCK_CARDS, MOCK_DONE_REPLIES), dry_run=True)
    results = dry.run()
    states = {result["email_id"]: result["state"] for result in results}
    check("mock_processed", states.get("email-001") == "processed")
    check("mock_malformed", states.get("email-002") == "malformed")
    check("mock_duplicate", states.get("email-003") == "duplicate_skipped")
    check("mock_dry_run_sends_nothing", len(dry.mermail.replies_sent) == 0)  # type: ignore[attr-defined]

    # Confirmed run: exactly one [DONE] reply per unique idempotency_key.
    argv_backup = sys.argv
    sys.argv = ["local_worker.py", "--yes"]
    try:
        live = build_worker(MockMermail(MOCK_CARDS, MOCK_DONE_REPLIES), dry_run=False)
        live.run()
    finally:
        sys.argv = argv_backup
    mock = live.mermail  # type: ignore[assignment]
    check("mock_single_reply", len(mock.replies_sent) == 1)
    if mock.replies_sent:
        check(
            "mock_reply_subject",
            mock.replies_sent[0]["subject"].startswith(DONE_PREFIX),
        )
        check(
            "mock_reply_key",
            "run-2026-09-07-001" in json.dumps(mock.replies_sent[0]),
        )
    sent_messages = captured.get("payload", {}).get("messages", [])
    check(
        "llm_task_as_chat_content",
        len(sent_messages) == 1
        and sent_messages[0]["role"] == "user"
        and "three bullets" in sent_messages[0]["content"],
    )

    if failures:
        print("SELF-TEST FAIL: " + ", ".join(failures), file=sys.stderr)
        return 1
    print(f"SELF-TEST PASS ({len(results)} cards seen, 1 reply sent)")
    return 0


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--mailbox-id", help="task mailbox public_id (user-designated)")
    parser.add_argument("--dry-run", action="store_true", help="preview replies, never send")
    parser.add_argument("--self-test", action="store_true", help="run built-in mock test")
    args = parser.parse_args(argv)

    if args.self_test:
        return self_test()

    api_key = os.environ.get("MERMAIL_API_KEY")
    if not api_key:
        print("ERROR: MERMAIL_API_KEY is not set", file=sys.stderr)
        return 2
    if not args.mailbox_id:
        print("ERROR: --mailbox-id is required (resolve it via list_mailboxes first)", file=sys.stderr)
        return 2
    mermail = MermailMcp(api_key, os.environ.get("MERMAIL_MCP_URL", DEFAULT_MCP_URL))
    try:
        results = LocalWorker(mermail, args).run()
    except WorkerError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(results, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
