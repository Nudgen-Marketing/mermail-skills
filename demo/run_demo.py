#!/usr/bin/env python3
"""Fictional offline review. No MCP, wallet, network or receipt writes."""
import json
from pathlib import Path

def main():
    root = Path(__file__).resolve().parent
    policy = json.loads((root / "fixtures/grant_policy.json").read_text())
    inquiry = json.loads((root / "fixtures/milestone_submission_email.json").read_text())
    print("FICTIONAL OFFLINE ILLUSTRATION — NOT LIVE VERIFICATION OR SETTLEMENT")
    print("Selected scope:", json.dumps(inquiry["selected"], sort_keys=True))
    print("Agreement-defined criteria:", len(policy["agreement"]["criteria"]))
    print("Claimed observation only. Actual selected owner must establish provenance.")
    print("Acceptance missing: acceptance_review_required. Draft only; nothing sent.")
    print("Budget terms use exact decimal strings:", json.dumps(policy["budget"]))
    print("Payment: manual_payment_handoff. No actual reservation or approval established.")
    print("No payment, send, verifier call, filing or receipt update was performed.")
    print("Run npm test separately for executable normalized-input projections.")

if __name__ == "__main__":
    main()
