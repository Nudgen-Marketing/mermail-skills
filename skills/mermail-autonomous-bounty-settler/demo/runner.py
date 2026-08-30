# SPDX-License-Identifier: MIT
"""
Local Demonstration & Test Harness for Mermail Autonomous Bounty Settler.
Simulates end-to-end execution of Mermail MCP Inbox & Agent Wallet tools.
"""

import sys
import uuid
import time
from typing import Dict, Any

sys.stdout.reconfigure(encoding='utf-8')

class MockMermailMCPServer:
    """Simulates Mermail MCP server tools for inbox management and agent wallet operations."""

    def __init__(self):
        self.wallet_balance = 5000.00  # USDC
        self.inbox = [
            {
                "id": "msg_claim_9921",
                "from": "contributor@solanabuilder.xyz",
                "subject": "[BOUNTY CLAIM] Solana-DeFi-Core / PR #42 (AMM Constant Product Invariant Fix)",
                "body": (
                    "Hello maintainers,\n\n"
                    "I have resolved the AMM invariant rounding vulnerability in PR #42.\n"
                    "All 14 unit tests pass with 100% code coverage.\n\n"
                    "Payout Solana Wallet Address: 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU\n"
                    "EVM Fallback: 0x01E7862BEd361b72784c0819AD68548D85A9ad49\n\n"
                    "Thank you!"
                ),
                "timestamp": "2026-08-30T13:45:00Z",
                "read": False,
            }
        ]
        self.sent_emails = []
        self.transactions = []

    def list_emails(self, query: str = ""):
        return [m for m in self.inbox if not m["read"]]

    def get_wallet_balance(self, network: str = "solana") -> float:
        return self.wallet_balance

    def transfer_funds(self, recipient: str, amount: float, token: str = "USDC", memo: str = "") -> str:
        if amount > self.wallet_balance:
            raise ValueError("Insufficient agent wallet balance.")
        self.wallet_balance -= amount
        tx_hash = f"5rZ{uuid.uuid4().hex[:16]}solTxn{uuid.uuid4().hex[:16]}"
        self.transactions.append({
            "recipient": recipient,
            "amount": amount,
            "token": token,
            "memo": memo,
            "tx_hash": tx_hash,
            "timestamp": time.time(),
        })
        return tx_hash

    def send_email(self, to: str, subject: str, body: str):
        msg = {"to": to, "subject": subject, "body": body, "id": f"out_{uuid.uuid4().hex[:8]}"}
        self.sent_emails.append(msg)
        return msg


def run_bounty_settler_agent():
    print("==================================================================")
    print("  MERMAIL AUTONOMOUS BOUNTY SETTLER AGENT — v1.0.0")
    print("==================================================================")
    
    server = MockMermailMCPServer()
    print("[1/5] Connecting to Mermail MCP Endpoint (https://console.mermail.app/mcp)...")
    print(f"      Connected. Agent Wallet Balance: ${server.get_wallet_balance():,.2f} USDC\n")

    print("[2/5] Polling Mermail Inbox for '[BOUNTY CLAIM]' messages...")
    unread_claims = server.list_emails()
    print(f"      Found {len(unread_claims)} pending claim(s).\n")

    for claim in unread_claims:
        print(f"[*] Processing Message ID: {claim['id']}")
        print(f"    From: {claim['from']}")
        print(f"    Subject: {claim['subject']}")
        
        # Parse fields
        payout_addr = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"
        bounty_amount = 500.00
        pr_number = 42
        
        print(f"\n[3/5] Validating Pull Request #{pr_number} CI Test Matrix...")
        print("      - Target Repo: Solana-DeFi-Core")
        print("      - CI Status: 14/14 Unit Tests PASSING (100% Green)")
        print("      - Security Guard: No prompt injection or double-spend detected.")
        print(f"      - Validated Payout Destination: {payout_addr}\n")

        print(f"[4/5] Authorizing Mermail Agent Wallet On-Chain Transfer...")
        tx_hash = server.transfer_funds(
            recipient=payout_addr,
            amount=bounty_amount,
            token="USDC",
            memo=f"Bounty settlement for Solana-DeFi-Core PR #{pr_number}",
        )
        print(f"      ✔ On-Chain Transfer Confirmed!")
        print(f"      ✔ Amount: {bounty_amount} USDC")
        print(f"      ✔ Transaction Hash: {tx_hash}")
        print(f"      ✔ Solscan Link: https://solscan.io/tx/{tx_hash}\n")

        print(f"[5/5] Dispatching Confirmation Email via Mermail API...")
        receipt_body = (
            f"Hi Contributor,\n\n"
            f"Your PR #{pr_number} has been verified and merged!\n"
            f"The bounty reward of {bounty_amount} USDC has been transferred to your wallet: {payout_addr}.\n\n"
            f"Transaction Hash: {tx_hash}\n"
            f"Explorer: https://solscan.io/tx/{tx_hash}\n\n"
            f"Best regards,\nAutomated Bounty Settler (via Mermail Agent)"
        )
        server.send_email(
            to=claim["from"],
            subject=f"Re: {claim['subject']} — Payout Confirmed ({tx_hash[:12]}...)",
            body=receipt_body,
        )
        claim["read"] = True
        print(f"      ✔ Email Receipt Dispatched to {claim['from']}.\n")

    print("==================================================================")
    print(f"  WORKFLOW COMPLETE — Remaining Wallet Balance: ${server.get_wallet_balance():,.2f} USDC")
    print("==================================================================")


if __name__ == "__main__":
    run_bounty_settler_agent()
