"""Offline behavioral regressions: actual helper library and CLI, no network."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import unittest

HELPER = Path(__file__).resolve().parents[1] / "skills/mermail-telegram-approval-desk/scripts/tg_approval.py"
spec = importlib.util.spec_from_file_location("approval", HELPER)
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)


def draft():
    return {"workspace_id": "workspace-synthetic", "mailbox_id": "mailbox-synthetic",
            "mailbox": "desk@example.test", "from": "desk@example.test",
            "source_email_id": "email-synthetic", "thread_id": "thread-synthetic", "draft_id": "draft-synthetic",
            "to": ["client@example.test"], "subject": "Re: design quote", "body": "The quote is USD 120."}


class Clock:
    now = 0.0

    def __call__(self):
        return self.now


class Bot:
    """Returns real-shaped updates after simulated blocking transport latency."""
    def __init__(self, clock, kind="button", arrived=11, answer_delay=0):
        self.clock, self.kind, self.arrived, self.answer_delay = clock, kind, arrived, answer_delay
        self.calls = []

    def call(self, method, **params):
        self.calls.append((method, params))
        if method == "getUpdates":
            self.clock.now = self.arrived
            if self.kind == "text":
                return [{"update_id": 1, "message": {"from": {"id": 1001}, "chat": {"id": 1001}, "text": "Replacement USD 150."}}]
            return [{"update_id": 1, "callback_query": {"id": "callback", "from": {"id": 1001},
                    "message": {"message_id": 42, "chat": {"id": 1001}}, "data": "mta1:approve:nonce"}}]
        if method == "answerCallbackQuery":
            self.clock.now += self.answer_delay
        return True


class Tests(unittest.TestCase):
    def test_late_and_exact_deadline_callbacks_timeout(self):
        for arrival in (10, 11, 50):
            with self.subTest(arrival=arrival):
                clock = Clock()
                bot = Bot(clock, arrived=arrival)
                desk = helper.ApprovalDesk(bot, 1001, 1001, clock=clock)
                self.assertEqual(desk.wait_for_button("nonce", 42, 10), ("timeout", None))
                self.assertFalse(any(method == "answerCallbackQuery" for method, _ in bot.calls))

    def test_in_time_callback_and_slow_acknowledgement(self):
        for delay, expected in ((0, ("approve", 1001)), (2, ("timeout", None))):
            clock = Clock()
            desk = helper.ApprovalDesk(Bot(clock, arrived=9, answer_delay=delay), 1001, 1001, clock=clock)
            self.assertEqual(desk.wait_for_button("nonce", 42, 10), expected)

    def test_late_edit_text_timeout_and_ordinary_edit_text(self):
        for arrival, expected in ((9, ("text", "Replacement USD 150.")), (10, ("timeout", None)), (11, ("timeout", None))):
            clock = Clock()
            desk = helper.ApprovalDesk(Bot(clock, "text", arrival), 1001, 1001, clock=clock)
            self.assertEqual(desk.wait_for_text(10), expected)

    def test_deadline_rechecked_between_updates(self):
        clock = Clock()
        bot = Bot(clock, arrived=9, answer_delay=2)
        ordinary = bot.call

        def call(method, **params):
            if method != "getUpdates":
                return ordinary(method, **params)
            updates = ordinary(method, **params)
            unauthorized = dict(updates[0]["callback_query"], **{"from": {"id": 2002}})
            return [{"update_id": 0, "callback_query": unauthorized}, *updates]

        bot.call = call
        desk = helper.ApprovalDesk(bot, 1001, 1001, clock=clock)
        self.assertEqual(desk.wait_for_button("nonce", 42, 10), ("timeout", None))

    def test_every_scope_change_binds_hash(self):
        original = draft()
        digest = helper.approval_hash(helper.normalize_payload(original))
        for field in helper.SCOPE_FIELDS:
            changed = dict(original, **{field: "changed-synthetic"})
            if field in ("from", "mailbox"):
                changed.update({"from": "other@example.test", "mailbox": "other@example.test"})
            with self.subTest(field=field):
                self.assertNotEqual(digest, helper.approval_hash(helper.normalize_payload(changed)))

    def test_missing_scope_and_unsupported_message_shape_rejected(self):
        for field in helper.SCOPE_FIELDS:
            for value in (None, "", " ", 12):
                with self.subTest(field=field, value=value), self.assertRaises(helper.ConfigError):
                    helper.normalize_payload(dict(draft(), **{field: value}))
        for extra in ({"from": "another@example.test"}, {"html": "<p>different</p>"},
                      {"attachments": [{"attachment_id": "unapproved"}]}, {"body_format": "html"},
                      {"references": ["unapproved"]}):
            with self.subTest(extra=extra), self.assertRaises(helper.ConfigError):
                helper.normalize_payload(dict(draft(), **extra))

    def test_unscoped_run_fails_before_any_bot_effect(self):
        clock = Clock()
        bot = Bot(clock)
        desk = helper.ApprovalDesk(bot, 1001, 1001, clock=clock)
        legacy = {"to": ["client@example.test"], "subject": "Quote", "body": "USD 120"}
        with self.assertRaises(helper.ConfigError):
            desk.run(legacy, 10, 10, 0)
        self.assertEqual(bot.calls, [])

    def test_cli_scope_version_and_legacy_rejection(self):
        def run(value, mode):
            result = subprocess.run([sys.executable, str(HELPER), mode], input=json.dumps(value), text=True, capture_output=True, timeout=5)
            return result.returncode, json.loads(result.stdout)
        code, result = run(draft(), "--hash-only")
        self.assertEqual(code, 0)
        self.assertEqual(result["payload"]["approval_version"], 2)
        self.assertEqual(result["payload"]["scope"]["source_email_id"], "email-synthetic")
        self.assertEqual(result["payload"]["attachments"], [])
        code, preview = run(draft(), "--render-only")
        self.assertEqual(code, 0)
        self.assertIn("mailbox-synthetic", "\n".join(preview["messages"]))
        self.assertIn("desk@example.test", "\n".join(preview["messages"]))
        legacy = {k: v for k, v in draft().items() if k not in helper.SCOPE_FIELDS}
        code, result = run(legacy, "--hash-only")
        self.assertEqual(code, 2)
        self.assertEqual(result["decision"], "error")


if __name__ == "__main__":
    unittest.main(verbosity=2)
