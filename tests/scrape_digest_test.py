import contextlib
import copy
import importlib.util
import io
import json
import pathlib
import runpy
import sys
import unittest
from unittest.mock import patch

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "skills/mermail-scraping-digest-agent/scripts/scrape_digest.py"
spec = importlib.util.spec_from_file_location("digest_helper", SCRIPT)
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)

def fixture():
    return {coin: {"usd": 123.25, "usd_24h_change": -1.5} for coin in helper.COINS}

class DigestTests(unittest.TestCase):
    def test_real_fields_render_and_never_claim_delivery(self):
        data = fixture()
        data["<script>injected</script>"] = {"usd": 1, "usd_24h_change": 1}
        text = helper.format_digest(data)
        self.assertIn("$123.25", text)
        self.assertIn("-1.50%", text)
        self.assertNotIn("injected", text)
        result = helper.send_to_mermail(text, "owner@example.test")
        self.assertEqual(result["status"], "blocked")
        self.assertFalse(result["delivered"])
        self.assertIn("not sent", result["digest"])

    def test_error_and_wrong_shapes_do_not_crash_formatter_or_echo_error(self):
        for bad in ({"error": "private provider details"}, None, [], "bad", {}):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                helper.format_digest(bad)

    def test_missing_values_are_not_zero(self):
        for field in ("usd", "usd_24h_change"):
            data = fixture()
            del data["solana"][field]
            with self.assertRaises(ValueError):
                helper.format_digest(data)
        data = fixture()
        data["solana"]["usd"] = 0
        self.assertIn("$0.00", helper.format_digest(data))  # explicit, not invented

    def test_invalid_numbers_fail_closed(self):
        for value in (True, "123", None, float("nan"), float("inf"), 10 ** 1000):
            data = fixture()
            data["solana"]["usd"] = value
            with self.subTest(value=type(value)), self.assertRaises(ValueError):
                helper.format_digest(data)
        data = fixture()
        data["solana"]["usd"] = -1
        with self.assertRaises(ValueError):
            helper.format_digest(data)

    def test_fetch_is_bounded_and_network_errors_are_generic(self):
        with patch("urllib.request.urlopen", side_effect=OSError("private provider details")):
            self.assertEqual(helper.scrape_market_data(), {"error": "market_fetch_failed"})
        with patch("urllib.request.urlopen", return_value=io.BytesIO(b"x" * (helper.MAX_RESPONSE_BYTES + 1))):
            self.assertEqual(helper.scrape_market_data(), {"error": "market_response_too_large"})

    def test_actual_cli_reports_not_delivered_without_real_network(self):
        raw = json.dumps(fixture()).encode()
        output = io.StringIO()
        with patch.object(sys, "argv", [str(SCRIPT), "owner@example.test"]), patch("urllib.request.urlopen", return_value=io.BytesIO(raw)), contextlib.redirect_stdout(output):
            with self.assertRaises(SystemExit) as stopped:
                runpy.run_path(str(SCRIPT), run_name="__main__")
        self.assertEqual(stopped.exception.code, 3)
        self.assertFalse(json.loads(output.getvalue())["delivered"])

    def test_missing_recipient_never_fetches_or_uses_demo_address(self):
        output = io.StringIO()
        with patch.object(sys, "argv", [str(SCRIPT)]), patch("urllib.request.urlopen", side_effect=AssertionError("no fetch")) as fetch, contextlib.redirect_stdout(output):
            with self.assertRaises(SystemExit) as stopped:
                runpy.run_path(str(SCRIPT), run_name="__main__")
        self.assertEqual(stopped.exception.code, 2)
        fetch.assert_not_called()
        self.assertEqual(json.loads(output.getvalue())["reason"], "explicit_recipient_required")

if __name__ == "__main__":
    unittest.main()
