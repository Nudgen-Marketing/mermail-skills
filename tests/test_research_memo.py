"""Actual local structural checks, no source fetch/model/payment/delivery."""
import copy
import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "skills/mermail-paid-work-verifier/scripts"))
import review_memo as r

JOB = {"identity": {"workspace_id": "ws", "mailbox_id": "mb", "job_id": "job1", "version": "v1"}, "as_of": "2026-10-21T12:00:00Z", "max_age_seconds": 86400}

def memo():
    return {"identity": JOB["identity"].copy(), "sources": [{"id": "s1", "url": "https://docs.example.test/page", "excerpt": "The demo has a documented limit of ten rows.", "owner_reviewed": True, "rights": "approved_for_use", "checked_at": "2026-10-21T10:00:00Z"}],
            "claims": [{"id": "c1", "text": "Demo limit is ten rows.", "label": "supported", "conflicting_evidence": False, "citations": [{"source_id": "s1", "quote": "limit of ten rows"}]}]}

class MemoTests(unittest.TestCase):
    def reasons(self, m):
        return {h["reason"] for h in r.review(JOB, m)["holds"]}
    def test_complete_structure_still_needs_semantic_review(self):
        result = r.review(JOB, memo())
        self.assertEqual(result["status"], "needs_owner_semantic_review")
        self.assertFalse(result["delivery_authorized"])
    def test_wrong_job_mailbox_or_version_rejected(self):
        for key in JOB["identity"]:
            m = memo(); m["identity"][key] = "other"
            with self.assertRaises(ValueError): r.review(JOB, m)
    def test_missing_citation_or_fabricated_quote_is_held(self):
        m = memo(); m["claims"][0]["citations"] = []
        self.assertIn("unsupported_claim", self.reasons(m))
        m = memo(); m["claims"][0]["citations"][0]["quote"] = "unseen quote"
        self.assertIn("quote_not_in_selected_evidence", self.reasons(m))
    def test_unknown_source_cannot_be_added_by_claim(self):
        m = memo(); m["claims"][0]["citations"][0]["source_id"] = "attacker"
        self.assertIn("unknown_citation", self.reasons(m))
    def test_honest_unverified_claim_needs_explicit_reason(self):
        m = memo(); m["claims"][0].update(label="unverified", citations=[])
        self.assertIn("missing_uncertainty_reason", self.reasons(m))
        m["claims"][0]["uncertainty"] = "No primary source available"
        self.assertEqual(self.reasons(m), set())
    def test_rights_and_review_flags_are_required(self):
        for changes in ({"owner_reviewed": False}, {"rights": "unknown"}):
            m = memo(); m["sources"][0].update(changes)
            self.assertIn("source_or_rights_not_reviewed", self.reasons(m))
    def test_stale_future_missing_source_times_hold(self):
        for date in ("2025-01-01T00:00:00Z", "2027-01-01T00:00:00Z", "2026-10-21"):
            m = memo(); m["sources"][0]["checked_at"] = date
            self.assertTrue(self.reasons(m) & {"source_stale_or_future", "missing_source_time"})
    def test_conflict_is_not_hidden_by_citations(self):
        m = memo(); m["claims"][0]["conflicting_evidence"] = True
        self.assertIn("conflict_not_resolved_or_reviewed", self.reasons(m))
    def test_bad_url_never_gets_fetched(self):
        for url in ("http://example.test", "https://u:p@example.test", "https://127.0.0.1/", "https://x.local/", "https://a.test/?token=secret", "https://xn--pypal-4ve.test/"):
            m = memo(); m["sources"][0]["url"] = url
            self.assertIn("unsafe_or_noncanonical_url", self.reasons(m))
    def test_duplicate_identity_and_budgets_rejected(self):
        for key in ("sources", "claims"):
            m = memo(); m[key] *= 2
            with self.assertRaises(ValueError): r.review(JOB, m)
        m = memo(); m["claims"] *= 31
        with self.assertRaises(ValueError): r.review(JOB, m)
    def test_output_does_not_echo_body_claim_quote_or_url(self):
        result = str(r.review(JOB, memo()))
        for private in ("ten rows", "docs.example.test", "Demo limit"):
            self.assertNotIn(private, result)
    def test_invalid_label_is_not_echoed_as_arbitrary_metadata(self):
        m = memo(); m["claims"][0]["label"] = {"private": "do-not-echo"}
        result = r.review(JOB, m)
        self.assertEqual(result["claims"][0]["label"], "invalid")
        self.assertNotIn("do-not-echo", str(result))
        self.assertIn("missing_claim_label", self.reasons(m))
    def test_input_limits_and_symlink(self):
        with tempfile.TemporaryDirectory() as directory:
            p = Path(directory).resolve() / "input.json"; p.write_text("{}")
            self.assertEqual(r.read(p), {})
            alias = p.with_name("alias"); alias.symlink_to(p)
            with self.assertRaises(ValueError): r.read(alias)
            p.write_bytes(b"x" * (1024 * 1024 + 1))
            with self.assertRaises(ValueError): r.read(p)

if __name__ == "__main__": unittest.main()
