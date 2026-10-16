#!/usr/bin/env python3
"""
mermail-invoice-chaser demo runner.

Runs the full invoice-chaser workflow:
  1. scan the inbox for invoice mail        (search_emails)
  2. extract invoice facts from bodies       (get_email)
  3. build an accounts-receivable aging ledger (current / 7+ days overdue / 30+ days overdue)
  4. draft polite, escalating follow-up emails per aging tier (save_draft)
  5. label processed invoices                (create_custom_label, move_email)
  6. print the chase report

Default mode is --demo: everything runs against fixtures/emails.json,
zero Mermail calls, no network. Pass --live to attempt a real connection
using MERMAIL_API_KEY / MERMAIL_MCP_URL (stub: it verifies credentials are
present and stops before any send unless --confirm-send is given).

Stdlib only. Exits 0 on success.
"""

import argparse
import datetime
import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SKILL_ROOT = HERE.parent
FIXTURES = SKILL_ROOT / "fixtures" / "emails.json"

# Tool calls the skill maps to, mirrored from references/tools.md.
TOOL_SEARCH = "search_emails"
TOOL_GET = "get_email"
TOOL_SAVE_DRAFT = "save_draft"
TOOL_LABEL = "create_custom_label"
TOOL_MOVE = "move_email"

KEYWORDS = ["invoice", "payment due", "receipt", "balance due", "past due",
            "statement of account"]

# Aging tiers: (label, min_days_overdue). First match wins.
TIERS = [("30+ days overdue", 30), ("7+ days overdue", 7), ("Current", -10**9)]

TIER_FOLLOWUPS = {
    "7+ days overdue": {
        "tone": "friendly reminder",
        "subject": "Friendly reminder: invoice {number} is past due",
        "body": (
            "Hi {sender},\n\n"
            "I hope you're well. This is a friendly reminder that invoice {number} "
            "for {amount} was due on {due}. I wanted to check whether it's already "
            "in your payment queue.\n\n"
            "If you have any questions about the invoice, just reply to this email "
            "and we'll sort it out.\n\n"
            "Thanks so much,\nAccounts Receivable"
        ),
    },
    "30+ days overdue": {
        "tone": "firm escalation",
        "subject": "Action needed: invoice {number} is {days} days overdue",
        "body": (
            "Hi {sender},\n\n"
            "I'm following up on invoice {number} for {amount}, which was due on "
            "{due} and is now {days} days overdue.\n\n"
            "We need a confirmed payment date this week. If there are issues with "
            "the invoice or you'd like to discuss payment terms, I'm happy to set "
            "up a call — but we do need this resolved promptly.\n\n"
            "Please reply with a payment date or call us directly.\n\n"
            "Regards,\nAccounts Receivable"
        ),
    },
}


def money(amount, currency):
    symbol = {"USD": "$"}.get(currency, currency + " ")
    return f"{symbol}{amount:,.2f}"


def load_fixtures():
    data = json.loads(FIXTURES.read_text(encoding="utf-8"))
    return data["invoices"]


def scan_inbox(invoices, today):
    """Mimic search_emails: keyword match over subject+body, skip paid receipts."""
    print(f"[{TOOL_SEARCH}] querying keywords: {', '.join(KEYWORDS)}")
    hits = []
    for inv in invoices:
        hay = f"{inv['subject']} {inv['body']}".lower()
        if any(k in hay for k in KEYWORDS):
            hits.append(inv)
    print(f"[{TOOL_SEARCH}] {len(hits)} invoice emails matched")
    return hits


def extract(invoices):
    """Mimic get_email extraction: pull invoice facts from each email."""
    extracted, skipped = [], []
    for inv in invoices:
        print(f"[{TOOL_GET}] {inv['email_id']}: {inv['subject'][:60]}")
        if inv["status"] == "paid":
            skipped.append(inv)
            continue
        extracted.append(inv)
    print(f"[{TOOL_GET}] extracted {len(extracted)} open invoices, "
          f"skipped {len(skipped)} paid receipt(s)")
    return extracted


def age_ledger(invoices, today):
    """Bucket invoices by days past due."""
    ledger = {name: [] for name, _ in TIERS}
    for inv in invoices:
        due = datetime.date.fromisoformat(inv["due_date"])
        days_overdue = (today - due).days
        for name, minimum in TIERS:
            if days_overdue >= minimum:
                ledger[name].append((inv, days_overdue))
                break
    return ledger


def draft_followup(inv, tier, days_overdue, mode):
    """Mimic save_draft (draft mode) or staged send (send mode)."""
    template = TIER_FOLLOWUPS[tier]
    subject = template["subject"].format(number=inv["invoice_number"],
                                         days=days_overdue)
    body = template["body"].format(
        sender=inv["from_name"], number=inv["invoice_number"],
        amount=money(inv["amount"], inv["currency"]),
        due=inv["due_date"], days=days_overdue)
    return {
        "invoice": inv["invoice_number"],
        "to": inv["from"],
        "tier": tier,
        "tone": template["tone"],
        "subject": subject,
        "body": body,
        "action": "draft saved" if mode == "draft" else "STAGED for send (awaiting approval)",
        "tool": TOOL_SAVE_DRAFT if mode == "draft" else "send_email/ reply_to_email",
    }


def label(invoices, label_name, folder):
    """Mimic create_custom_label + optional move_email."""
    print(f"[{TOOL_LABEL}] applied label '{label_name}' to {len(invoices)} invoices")
    print(f"[{TOOL_MOVE}] moved {len(invoices)} invoices to folder '{folder}'")


def print_report(ledger, drafts, mode, today, label_name, folder):
    print("\n" + "=" * 60)
    print("  CHASE REPORT — mermail-invoice-chaser")
    print(f"  run date: {today.isoformat()}   mode: {mode}")
    print("=" * 60)
    total = 0.0
    for tier, _ in TIERS:
        rows = ledger[tier]
        print(f"\n[{tier.upper()}] {len(rows)} invoice(s)")
        for inv, days in rows:
            amt = money(inv["amount"], inv["currency"])
            status = f"{days} days overdue" if days > 0 else f"due in {-days} days"
            print(f"  {inv['invoice_number']:<14} {amt:>12}  {inv['from_name']:<18} {status}")
            if days > 0:
                total += inv["amount"]
    print(f"\nTotal overdue: ${total:,.2f}")
    print(f"\nFollow-ups ({len(drafts)}):")
    for d in drafts:
        print(f"  - [{d['tone']}] {d['invoice']} -> {d['to']}  ({d['action']} via {d['tool']})")
    print(f"\nLabels: '{label_name}' applied; filed to '{folder}'")
    print("\nSample draft (30+ tier):")
    sample = next((d for d in drafts if d["tier"] == "30+ days overdue"), None)
    if sample:
        print(f"  To: {sample['to']}\n  Subject: {sample['subject']}\n")
        for line in sample["body"].splitlines():
            print(f"  {line}")
    print("=" * 60 + "\n")


def run_demo(today, mode, label_name, folder):
    print("mermail-invoice-chaser — DEMO MODE")
    print("(simulated run against fixtures/emails.json; no Mermail calls)\n")
    invoices = load_fixtures()
    hits = scan_inbox(invoices, today)
    open_invoices = extract(hits)
    ledger = age_ledger(open_invoices, today)
    drafts = []
    for tier, _ in TIERS:
        for inv, days in ledger[tier]:
            if tier == "Current":
                continue
            drafts.append(draft_followup(inv, tier, days, mode))
    for d in drafts:
        print(f"[{d['tool']}] draft for {d['invoice']} ({d['tone']})")
    label(open_invoices, label_name, folder)
    print_report(ledger, drafts, mode, today, label_name, folder)
    return 0


def run_live(today, mode, label_name, folder, confirm_send):
    print("mermail-invoice-chaser — LIVE MODE (stub)\n")
    api_key = os.environ.get("MERMAIL_API_KEY")
    mcp_url = os.environ.get("MERMAIL_MCP_URL", "https://console.mermail.app/mcp")
    if not api_key:
        print("ERROR: MERMAIL_API_KEY is not set. Refusing to run against a real mailbox.")
        return 2
    print(f"MCP endpoint: {mcp_url}")
    print("Credential present. A full live implementation would now:")
    print(f"  1. [{TOOL_SEARCH}] scan the real mailbox for invoice keywords")
    print(f"  2. [{TOOL_GET}] extract invoice facts from matched bodies")
    print(f"  3. build the aging ledger relative to {today.isoformat()}")
    print(f"  4. [{TOOL_SAVE_DRAFT}] draft follow-ups (mode={mode})")
    print(f"  5. [{TOOL_LABEL}] label '{label_name}' and [{TOOL_MOVE}] -> '{folder}'")
    if mode == "send" and not confirm_send:
        print("\nRefusing to send: --confirm-send is required for live sends.")
        return 2
    print("\nThis demo build stops here: wire steps 1-5 to your MCP client.")
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(description="Run the mermail-invoice-chaser workflow.")
    ap.add_argument("--demo", action="store_true", default=True,
                    help="run against local fixtures (default)")
    ap.add_argument("--live", action="store_true",
                    help="attempt a real Mermail connection (stub)")
    ap.add_argument("--mode", choices=["draft", "send"], default="draft",
                    help="draft follow-ups (default) or stage them for sending")
    ap.add_argument("--today", default=None,
                    help="override run date (YYYY-MM-DD); default: today")
    ap.add_argument("--label", default="AR: chased", help="label applied to processed invoices")
    ap.add_argument("--folder", default="AR Follow-ups", help="folder invoices are filed to")
    ap.add_argument("--confirm-send", action="store_true",
                    help="required for any live send")
    args = ap.parse_args(argv)

    today = datetime.date.fromisoformat(args.today) if args.today \
        else datetime.date.today()

    if args.live:
        return run_live(today, args.mode, args.label, args.folder, args.confirm_send)
    return run_demo(today, args.mode, args.label, args.folder)


if __name__ == "__main__":
    sys.exit(main())
