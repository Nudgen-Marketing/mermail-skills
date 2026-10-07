#!/usr/bin/env python3
"""
Mermail Grant Milestone Desk — High-End Web3 & Cybersecurity Audit Console
--------------------------------------------------------------------------
Production CLI simulation with ANSI color hierarchy, agent thinking latency,
pixel-perfect monospaced tabular alignment, clean MCP payload digests,
tiered signing policy enforcement, and immutable local audit ledger output.
"""

import sys
import time
import json
import re
import unicodedata
import argparse
from datetime import datetime, timezone
from pathlib import Path

# Ensure UTF-8 output on Windows terminals
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

# ── ANSI HIGH-CONTRAST PALETTE ──
class Colors:
    RESET = '\033[0m'
    BOLD = '\033[1m'
    DIM = '\033[2m'
    UNDERLINE = '\033[4m'
    
    # Crisp Neon & Status Colors
    GREEN = '\033[1;92m'       # Pass, verified, confirmed settlement
    RED = '\033[1;91m'         # Fail, lockout, prohibited
    YELLOW = '\033[1;93m'      # Warnings, stages, policy evaluation
    BLUE = '\033[1;94m'        # Brand blue
    MAGENTA = '\033[1;95m'     # Accent purple
    CYAN = '\033[1;96m'        # MCP badges, links, hashes
    WHITE = '\033[1;97m'       # High-contrast bold white
    GRAY = '\033[90m'          # Subtle borders, dividers, secondary

# ── MONOSPACED DISPLAY WIDTH & PADDING ENGINE ──
def display_width(text: str) -> int:
    """Calculate the true monospaced terminal column width, stripping ANSI escapes."""
    clean = re.sub(r'\033\[[0-9;]*m', '', text)
    width = 0
    for char in clean:
        status = unicodedata.east_asian_width(char)
        width += 2 if status in ('W', 'F') else 1
    return width

def pad_cell(text: str, target_width: int, align: str = 'left') -> str:
    """Pad string to exact visual terminal display width regardless of ANSI codes or unicode symbols."""
    dw = display_width(text)
    pad_needed = max(0, target_width - dw)
    if align == 'left':
        return text + (' ' * pad_needed)
    elif align == 'right':
        return (' ' * pad_needed) + text
    else:
        left_pad = pad_needed // 2
        right_pad = pad_needed - left_pad
        return (' ' * left_pad) + text + (' ' * right_pad)

def print_banner():
    width = 68
    top = "╔" + ("═" * width) + "╗"
    bot = "╚" + ("═" * width) + "╝"
    title = "MERMAIL AGENT SKILL: GRANT MILESTONE DESK"
    subtitle = "Autonomous Web3 Deliverable Intake & PayBox Disbursements"
    line1 = "║" + title.center(width) + "║"
    line2 = "║" + subtitle.center(width) + "║"

    print(f"\n{Colors.CYAN}{Colors.BOLD}{top}")
    print(f"{line1}")
    print(f"{line2}")
    print(f"{bot}{Colors.RESET}\n")

def step_header(num: int, title: str):
    print(f"\n{Colors.BOLD}{Colors.YELLOW}══▶ [STAGE {num}/5] {title.upper()}{Colors.RESET}")
    print(f"{Colors.GRAY}" + ("─" * 78) + f"{Colors.RESET}")

def simulate_agent_thinking(action_text: str = "Analyzing deliverable artifacts", duration: float = 0.45):
    """Simulates agent cognitive evaluation with a smooth terminal pulse."""
    frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
    end_time = time.time() + duration
    i = 0
    sys.stdout.write(f"  {Colors.CYAN}{frames[0]} {action_text}...{Colors.RESET}")
    sys.stdout.flush()
    while time.time() < end_time:
        time.sleep(0.06)
        i = (i + 1) % len(frames)
        sys.stdout.write(f"\r  {Colors.CYAN}{frames[i]} {action_text}...{Colors.RESET}")
        sys.stdout.flush()
    sys.stdout.write(f"\r  {Colors.GREEN}✔ {action_text} [COMPLETED]{Colors.RESET}\n")
    sys.stdout.flush()

def render_mcp_call(tool_name: str, args: dict, response: dict, delay: float = 0.35):
    """Renders a clean, structured MCP tool card digest rather than noisy raw JSON dumps."""
    time.sleep(0.15)
    print(f"\n  {Colors.BOLD}{Colors.CYAN}⚡ [MCP CALL]{Colors.RESET} {Colors.WHITE}{tool_name}{Colors.RESET}")
    
    # Digest generation based on tool
    print(f"  {Colors.GRAY}┌─ Input Digest ─────────────────────────────────────────────────────────────┐{Colors.RESET}")
    if tool_name == "list_mailboxes":
        print(f"  {Colors.GRAY}│{Colors.RESET} Query: {Colors.DIM}include_settings: true{Colors.RESET}")
    elif tool_name == "search_emails":
        q = args.get("query", {})
        print(f"  {Colors.GRAY}│{Colors.RESET} Mailbox: {Colors.WHITE}{args.get('mailboxId')}{Colors.RESET} | Filter: {Colors.CYAN}term='{q.get('searchTerm')}', sort={q.get('sortColumn')}:{q.get('sortDirection')}{Colors.RESET}")
    elif tool_name == "get_email":
        print(f"  {Colors.GRAY}│{Colors.RESET} Mailbox: {Colors.WHITE}{args.get('mailboxId')}{Colors.RESET} | Target Msg ID: {Colors.CYAN}{args.get('emailId')}{Colors.RESET}")
    elif tool_name == "paybox_request_transfer":
        print(f"  {Colors.GRAY}│{Colors.RESET} Asset: {Colors.GREEN}{args.get('amount')} {args.get('asset')}{Colors.RESET} on {Colors.CYAN}{args.get('chain')}{Colors.RESET}")
        print(f"  {Colors.GRAY}│{Colors.RESET} Recipient: {Colors.WHITE}{args.get('recipient')}{Colors.RESET}")
        print(f"  {Colors.GRAY}│{Colors.RESET} Memo: {Colors.DIM}{args.get('memo')}{Colors.RESET}")
    elif tool_name == "paybox_get_request":
        print(f"  {Colors.GRAY}│{Colors.RESET} Query Request ID: {Colors.CYAN}{args.get('request_id')}{Colors.RESET}")
    elif tool_name == "save_draft":
        body = args.get("body", {})
        print(f"  {Colors.GRAY}│{Colors.RESET} To: {Colors.WHITE}{body.get('to')}{Colors.RESET} | From: {Colors.WHITE}{body.get('from')}{Colors.RESET}")
        print(f"  {Colors.GRAY}│{Colors.RESET} Subject: {Colors.BOLD}{body.get('subject')}{Colors.RESET}")
        print(f"  {Colors.GRAY}│{Colors.RESET} Idempotency: {Colors.DIM}{args.get('idempotencyKey')}{Colors.RESET}")
    elif tool_name == "send_email":
        print(f"  {Colors.GRAY}│{Colors.RESET} Dispatching Draft: {Colors.CYAN}{args.get('draftId')}{Colors.RESET}")
        print(f"  {Colors.GRAY}│{Colors.RESET} Idempotency: {Colors.DIM}{args.get('idempotencyKey')}{Colors.RESET}")
    else:
        summary = ", ".join(f"{k}={v}" for k, v in list(args.items())[:3])
        print(f"  {Colors.GRAY}│{Colors.RESET} {Colors.DIM}{summary}{Colors.RESET}")
    print(f"  {Colors.GRAY}└────────────────────────────────────────────────────────────────────────────┘{Colors.RESET}")

    time.sleep(delay)

    print(f"  {Colors.GRAY}┌─ Streamable HTTP Response ─────────────────────────────────────────────────┐{Colors.RESET}")
    if tool_name == "list_mailboxes":
        mb = response["mailboxes"][0]
        print(f"  {Colors.GRAY}│{Colors.RESET} Status: {Colors.GREEN}200 OK{Colors.RESET} | Active Mailbox: {Colors.WHITE}{mb['email']}{Colors.RESET} ({Colors.CYAN}{mb['public_id']}{Colors.RESET}) [{mb['plan']}]")
    elif tool_name == "search_emails":
        count = len(response.get("messages", []))
        first = response["messages"][0] if count > 0 else {}
        print(f"  {Colors.GRAY}│{Colors.RESET} Status: {Colors.GREEN}200 OK{Colors.RESET} | Matches Found: {Colors.GREEN}{count}{Colors.RESET} message(s)")
        print(f"  {Colors.GRAY}│{Colors.RESET} Matched: {Colors.CYAN}{first.get('id')}{Colors.RESET} | Subj: {Colors.DIM}{first.get('subject')[:48]}...{Colors.RESET}")
    elif tool_name == "get_email":
        auth = response.get("sender_authentication", {})
        print(f"  {Colors.GRAY}│{Colors.RESET} Status: {Colors.GREEN}200 OK{Colors.RESET} | From: {Colors.WHITE}{response.get('from')}{Colors.RESET}")
        print(f"  {Colors.GRAY}│{Colors.RESET} Security: SPF={Colors.GREEN}{auth.get('spf')}{Colors.RESET}, DKIM={Colors.GREEN}{auth.get('dkim')}{Colors.RESET}, DMARC={Colors.GREEN}{auth.get('dmarc')}{Colors.RESET} | Scan: {Colors.GREEN}{response.get('scan_status')}{Colors.RESET}")
    elif tool_name == "get_paybox_connection":
        print(f"  {Colors.GRAY}│{Colors.RESET} Status: {Colors.GREEN}200 OK{Colors.RESET} | PayBox State: {Colors.GREEN}{response.get('status')}{Colors.RESET} | Mode: {Colors.WHITE}{response.get('auth_mode')}{Colors.RESET}")
    elif tool_name == "paybox_get_portfolio":
        usdc = next((t["amount"] for t in response["tokens"] if t["symbol"] == "USDC"), "0")
        sol = next((t["amount"] for t in response["tokens"] if t["symbol"] == "SOL"), "0")
        print(f"  {Colors.GRAY}│{Colors.RESET} Status: {Colors.GREEN}200 OK{Colors.RESET} | Holdings: {Colors.GREEN}{usdc} USDC{Colors.RESET}, {Colors.CYAN}{sol} SOL{Colors.RESET}")
    elif tool_name == "paybox_request_transfer":
        handoff = response.get("signing_handoff", {})
        print(f"  {Colors.GRAY}│{Colors.RESET} Status: {Colors.YELLOW}{response.get('status').upper()}{Colors.RESET} | Request ID: {Colors.CYAN}{response.get('request_id')}{Colors.RESET}")
        print(f"  {Colors.GRAY}│{Colors.RESET} Signing URL: {Colors.UNDERLINE}{Colors.CYAN}{handoff.get('console_url')}{Colors.RESET}")
        print(f"  {Colors.GRAY}│{Colors.RESET} TTL: {Colors.DIM}{handoff.get('expires_in_seconds')} seconds{Colors.RESET}")
    elif tool_name == "paybox_get_request":
        print(f"  {Colors.GRAY}│{Colors.RESET} Status: {Colors.GREEN}SETTLED (200 OK){Colors.RESET} | Tx: {Colors.CYAN}{response.get('tx_hash')[:24]}...{Colors.RESET}")
        print(f"  {Colors.GRAY}│{Colors.RESET} Explorer: {Colors.UNDERLINE}{Colors.CYAN}{response.get('explorer_url')}{Colors.RESET}")
    elif tool_name in ("save_draft", "send_email"):
        res_id = response.get("draft_id") or response.get("message_id")
        print(f"  {Colors.GRAY}│{Colors.RESET} Status: {Colors.GREEN}200 OK ({response.get('status').upper()}){Colors.RESET} | ID: {Colors.CYAN}{res_id}{Colors.RESET}")
    else:
        print(f"  {Colors.GRAY}│{Colors.RESET} Status: {Colors.GREEN}200 OK{Colors.RESET}")
    print(f"  {Colors.GRAY}└────────────────────────────────────────────────────────────────────────────┘{Colors.RESET}\n")

def pause_for_user(prompt_text: str = "Press Enter to continue...", auto: bool = False):
    if auto:
        print(f"  {Colors.DIM}⚡ [AUTO-PROGRESS] {prompt_text}{Colors.RESET}")
        time.sleep(0.65)
    else:
        try:
            input(f"\n  {Colors.CYAN}👉 {prompt_text} {Colors.RESET}")
        except (EOFError, KeyboardInterrupt):
            print("\nExiting demo.")
            sys.exit(0)

def render_scorecard_table(rows: list[tuple[str, str, str, str]]):
    """Renders pixel-perfect monospaced table where vertical border columns never shift."""
    col_widths = [26, 28, 12, 20]
    total_w = sum(col_widths) + 3 * 3 + 4  # 99 chars
    
    top = "┌" + "─" * (col_widths[0] + 2) + "┬" + "─" * (col_widths[1] + 2) + "┬" + "─" * (col_widths[2] + 2) + "┬" + "─" * (col_widths[3] + 2) + "┐"
    mid = "├" + "─" * (col_widths[0] + 2) + "┼" + "─" * (col_widths[1] + 2) + "┼" + "─" * (col_widths[2] + 2) + "┼" + "─" * (col_widths[3] + 2) + "┤"
    bot = "└" + "─" * (col_widths[0] + 2) + "┴" + "─" * (col_widths[1] + 2) + "┴" + "─" * (col_widths[2] + 2) + "┴" + "─" * (col_widths[3] + 2) + "┘"
    
    title_bar = "│" + pad_cell(f"{Colors.BOLD}{Colors.WHITE}MILESTONE DELIVERABLE EVALUATION SCORECARD{Colors.RESET}", total_w - 2, 'center') + "│"
    
    h0 = pad_cell(f"{Colors.BOLD}Requirement{Colors.RESET}", col_widths[0], 'left')
    h1 = pad_cell(f"{Colors.BOLD}Submitted Evidence{Colors.RESET}", col_widths[1], 'left')
    h2 = pad_cell(f"{Colors.BOLD}Status{Colors.RESET}", col_widths[2], 'center')
    h3 = pad_cell(f"{Colors.BOLD}Verification Log{Colors.RESET}", col_widths[3], 'left')
    header_row = f"│ {h0} │ {h1} │ {h2} │ {h3} │"

    print(f"\n{Colors.GRAY}{top}{Colors.RESET}")
    print(f"{Colors.GRAY}{title_bar}{Colors.RESET}")
    print(f"{Colors.GRAY}{mid}{Colors.RESET}")
    print(f"{Colors.GRAY}{header_row}{Colors.RESET}")
    print(f"{Colors.GRAY}{mid}{Colors.RESET}")

    for r, e, s_type, v in rows:
        c0 = pad_cell(r, col_widths[0], 'left')
        c1 = pad_cell(e, col_widths[1], 'left')
        
        # Colorized badge with zero width drift
        if s_type == "PASS":
            s_badge = f"{Colors.GREEN}✔ PASS{Colors.RESET}"
        elif s_type == "FAIL":
            s_badge = f"{Colors.RED}✖ FAIL{Colors.RESET}"
        else:
            s_badge = f"{Colors.GREEN}✔ MATCH{Colors.RESET}"
        
        c2 = pad_cell(s_badge, col_widths[2], 'center')
        c3 = pad_cell(v, col_widths[3], 'left')
        print(f"{Colors.GRAY}│{Colors.RESET} {c0} {Colors.GRAY}│{Colors.RESET} {c1} {Colors.GRAY}│{Colors.RESET} {c2} {Colors.GRAY}│{Colors.RESET} {c3} {Colors.GRAY}│{Colors.RESET}")

    print(f"{Colors.GRAY}{bot}{Colors.RESET}\n")

def select_scenario(auto: bool = False, cli_scenario: int | None = None) -> int:
    if cli_scenario in (1, 2):
        return cli_scenario
    if auto:
        return 1

    print(f"{Colors.BOLD}{Colors.WHITE}SELECT OPERATIONAL SCENARIO:{Colors.RESET}")
    print(f"  {Colors.GREEN}{Colors.BOLD}[1] Scenario 1: Approved Deliverable{Colors.RESET} (Merged PR, 84.6% coverage, PayBox payout, audit ledger)")
    print(f"  {Colors.RED}{Colors.BOLD}[2] Scenario 2: Rejected Deliverable{Colors.RESET} (Failing CI, 68.2% coverage, PayBox lockout, revision draft)")
    
    while True:
        try:
            choice = input(f"\n  {Colors.CYAN}Select scenario [1-2] (default: 1): {Colors.RESET}").strip()
            if not choice or choice == "1":
                return 1
            if choice == "2":
                return 2
            print(f"  {Colors.YELLOW}Please enter 1 or 2.{Colors.RESET}")
        except (EOFError, KeyboardInterrupt):
            print("\nExiting.")
            sys.exit(0)

def run_simulation(scenario: int = 1, auto_mode: bool = False):
    fixtures_dir = Path(__file__).parent / "fixtures"
    receipts_dir = Path(__file__).parent / "receipts"
    
    with open(fixtures_dir / "grant_policy.json", "r", encoding="utf-8") as f:
        policy = json.load(f)

    if scenario == 1:
        email_fixture = fixtures_dir / "milestone_submission_email.json"
        scenario_title = "SCENARIO 1: APPROVED DELIVERABLE & PAYBOX DISBURSEMENT"
        scenario_color = Colors.GREEN
    else:
        email_fixture = fixtures_dir / "milestone_submission_email_rejected.json"
        scenario_title = "SCENARIO 2: REJECTED DELIVERABLE & FINANCIAL LOCKOUT"
        scenario_color = Colors.RED

    with open(email_fixture, "r", encoding="utf-8") as f:
        email = json.load(f)

    print_banner()
    print(f"  {Colors.BOLD}Simulation Mode:{Colors.RESET}         {scenario_color}{Colors.BOLD}{scenario_title}{Colors.RESET}")
    print(f"  {Colors.BOLD}Grant Under Review:{Colors.RESET}      {Colors.WHITE}{policy['title']}{Colors.RESET}")
    print(f"  {Colors.BOLD}Grantee Organization:{Colors.RESET}    {Colors.WHITE}{policy['grantee_organization']}{Colors.RESET}")
    print(f"  {Colors.BOLD}Registered Solana Key:{Colors.RESET}   {Colors.CYAN}{policy['grantee_payout_address']}{Colors.RESET}")
    print(f"  {Colors.BOLD}Committed Budget:{Colors.RESET}        {Colors.GREEN}{policy['total_allocation']} USDC{Colors.RESET} (Remaining Cap: {Colors.CYAN}{policy['remaining_cap']} USDC{Colors.RESET})\n")
    
    pause_for_user("Start Stage 1: Resolve Operations Mailbox & Policy Binding", auto_mode)

    # ── STAGE 1: Mailbox Resolution & Policy Binding ──
    step_header(1, "Mailbox Resolution & Policy Binding")
    simulate_agent_thinking("Probing connected Mermail MCP mailboxes", 0.4)
    
    render_mcp_call(
        "list_mailboxes",
        {"include_settings": True},
        {
            "mailboxes": [
                {
                    "public_id": "mb_superteam_grants_01",
                    "email": "grants@mermail.app",
                    "name": "Superteam Grant Desk",
                    "status": "ACTIVE",
                    "plan": "full-profile"
                }
            ]
        }
    )
    print(f"  {Colors.GREEN}✔ Mailbox Bound:{Colors.RESET} grants@mermail.app ({Colors.CYAN}mb_superteam_grants_01{Colors.RESET})")
    print(f"  {Colors.GREEN}✔ Standing Policy Loaded:{Colors.RESET} {policy['grant_id']} with 3 milestone schedules.")

    pause_for_user("Proceed to Stage 2: Inbound Email Intake & Untrusted Input Sanitization", auto_mode)

    # ── STAGE 2: Inbound Intake & Untrusted Input Sanitization ──
    step_header(2, "Inbound Submission Intake & Sanitization")
    simulate_agent_thinking("Querying inbox for Milestone 2 submissions", 0.35)
    
    render_mcp_call(
        "search_emails",
        {
            "mailboxId": "mb_superteam_grants_01",
            "query": {
                "sortColumn": "date",
                "sortDirection": "DESC",
                "searchTerm": "Milestone 2"
            }
        },
        {
            "messages": [
                {
                    "id": email["id"],
                    "from": email["from"],
                    "subject": email["subject"],
                    "date": email["date"],
                    "scan_status": email["scan_status"]
                }
            ]
        }
    )

    simulate_agent_thinking("Extracting deliverable references and cryptographic authentication", 0.4)
    render_mcp_call(
        "get_email",
        {"mailboxId": "mb_superteam_grants_01", "emailId": email["id"]},
        email
    )

    print(f"  {Colors.YELLOW}🛡️  [SECURITY AUDIT - UNTRUSTED INPUT DEFENSE]{Colors.RESET}")
    print(f"    • Sender Auth: {Colors.GREEN}SPF: PASS │ DKIM: PASS │ DMARC: PASS{Colors.RESET}")
    print(f"    • Virus & Phishing Scan: {Colors.GREEN}CLEAN{Colors.RESET}")
    print(f"    • Email Body Payload: {Colors.DIM}Treated strictly as untrusted applicant assertions{Colors.RESET}")
    print(f"    • Destination Binding: {Colors.CYAN}Bound exclusively to Standing Grant Policy (Email address ignored){Colors.RESET}")

    pause_for_user("Proceed to Stage 3: Deliverable Verification & Evaluation Scorecard", auto_mode)

    # ── STAGE 3: Deliverable Verification & Scorecard ──
    step_header(3, "Deliverable Verification & Scorecard")
    simulate_agent_thinking("Verifying GitHub PR state, CI build logs, and test coverage", 0.5)

    if scenario == 1:
        scorecard_rows = [
            ("1. GitHub PR Merged", "PR #42 (commit a3b8c1d)", "PASS", "CI 100% Green"),
            ("2. Test Coverage >= 80%", "84.6% branch coverage", "PASS", "Verified artifact"),
            ("3. Developer Documentation", "docs.superteam.fun/bio", "PASS", "Live & accessible"),
            ("4. Recipient Wallet Audit", "8vFtM21B6j...3xKp7L", "MATCH", "Matches Policy")
        ]
        render_scorecard_table(scorecard_rows)
        print(f"  {Colors.GREEN}{Colors.BOLD}★ EVALUATION DECISION: ALL CRITERIA SATISFIED. APPROVED FOR PAYOUT PROPOSAL.{Colors.RESET}")
        
        pause_for_user("Proceed to Stage 4: Treasury Check, Budget Cap & PayBox Proposal", auto_mode)

        # ── STAGE 4: Treasury Check, Tiered Signing & PayBox Proposal ──
        step_header(4, "Treasury Check, Tiered Signing Policy & PayBox Proposal")
        simulate_agent_thinking("Probing PayBox Agent Wallet readiness on Solana", 0.35)
        
        render_mcp_call(
            "get_paybox_connection",
            {},
            {
                "status": "ACTIVE",
                "auth_mode": "oauth_full_profile",
                "supported_chains": ["solana", "ethereum", "polygon"],
                "wallet_address": "4kX9rT...7LmQ"
            }
        )

        render_mcp_call(
            "paybox_get_portfolio",
            {"chain": "solana"},
            {
                "tokens": [
                    {"symbol": "SOL", "amount": "48.25", "usd_value": 7237.50},
                    {"symbol": "USDC", "amount": "14250.00", "usd_value": 14250.00}
                ]
            }
        )

        print(f"  {Colors.BOLD}Financial Validation:{Colors.RESET}")
        print(f"    • Treasury USDC Holdings: 14,250.00 USDC ({Colors.GREEN}SUFFICIENT LIQUIDITY{Colors.RESET})")
        print(f"    • Milestone 2 Allocation:  2,000.00 USDC")
        print(f"    • Current Grant Cap:      4,000.00 USDC")
        print(f"    • Cap After Disbursement: 2,000.00 USDC ({Colors.GREEN}WITHIN BUDGET CAP{Colors.RESET})\n")

        print(f"  {Colors.YELLOW}{Colors.BOLD}📜 [TIERED SIGNING POLICY ENFORCEMENT]{Colors.RESET}")
        print(f"    • Requested Amount: {Colors.WHITE}2,000.00 USDC{Colors.RESET}")
        print(f"    • Micro-Grant Threshold: < 250.00 USDC (Autonomous release eligible)")
        print(f"    • Major Milestone Threshold: >= 250.00 USDC ({Colors.RED}{Colors.BOLD}MANDATORY HUMAN PASSKEY SIGNING{Colors.RESET})")
        print(f"    • Enforced Action: {Colors.CYAN}Autonomous release bypassed ➔ Console Handoff Required{Colors.RESET}\n")

        pause_for_user("Confirm Sponsor Approval to initiate PayBox proposal", auto_mode)

        simulate_agent_thinking("Generating cryptographic PayBox transfer proposal", 0.4)
        render_mcp_call(
            "paybox_request_transfer",
            {
                "asset": "USDC",
                "chain": "solana",
                "recipient": policy["grantee_payout_address"],
                "amount": "2000.00",
                "memo": "Superteam Mobile SDK - Milestone 2 Disbursement"
            },
            {
                "request_id": "req_sol_98721",
                "status": "pending_signature",
                "signing_handoff": {
                    "console_url": "https://console.mermail.app/paybox/requests/req_sol_98721/sign",
                    "expires_in_seconds": 300
                }
            }
        )

        print(f"  {Colors.CYAN}{Colors.BOLD}🔐 PAYBOX SIGNING HANDOFF CREATED:{Colors.RESET}")
        print(f"    Console URL: {Colors.UNDERLINE}{Colors.CYAN}https://console.mermail.app/paybox/requests/req_sol_98721/sign{Colors.RESET}")
        print(f"    {Colors.DIM}(Sponsor opens Mermail Console to authorize via Passkey/Ledger. Model paused.){Colors.RESET}")

        pause_for_user("Simulate Sponsor Cryptographic Signature in Console", auto_mode)

        # ── STAGE 5: Settlement Verification & Audit Receipt Dispatch ──
        step_header(5, "Settlement Verification & Audit Receipt Dispatch")
        simulate_agent_thinking("Polling PayBox for on-chain Solana settlement confirmation", 0.4)
        
        render_mcp_call(
            "paybox_get_request",
            {"request_id": "req_sol_98721"},
            {
                "request_id": "req_sol_98721",
                "status": "success",
                "asset": "USDC",
                "amount": "2000.00",
                "recipient": policy["grantee_payout_address"],
                "settled_at": "2026-09-18T20:18:42Z",
                "tx_hash": "4zY1u7xK9pLm2Nv5Qw8Rs1Tc3Ya7Bf9Ge2Hj6Kl4Np8Qr1St3Uv5Wx7Yz9Aa1Bb2",
                "explorer_url": "https://solscan.io/tx/4zY1u7xK9pLm2Nv5Qw8Rs1Tc3Ya7Bf9Ge2Hj6Kl4Np8Qr1St3Uv5Wx7Yz9Aa1Bb2"
            }
        )

        print(f"  {Colors.GREEN}{Colors.BOLD}✔ ON-CHAIN SETTLEMENT CONFIRMED ON SOLANA MAINNET!{Colors.RESET}")
        print(f"    Tx Hash: {Colors.WHITE}4zY1u7xK9pLm2Nv5Qw8Rs1Tc3Ya7Bf9Ge2Hj6Kl4Np8Qr1St3Uv5Wx7Yz9Aa1Bb2{Colors.RESET}")
        print(f"    Explorer: {Colors.UNDERLINE}{Colors.CYAN}https://solscan.io/tx/4zY1u7xK9pLm2Nv5Qw8Rs1Tc3Ya7Bf9Ge2Hj6Kl4Np8Qr1St3Uv5Wx7Yz9Aa1Bb2{Colors.RESET}\n")

        simulate_agent_thinking("Composing immutable milestone completion receipt draft", 0.3)
        render_mcp_call(
            "save_draft",
            {
                "mailboxId": "mb_superteam_grants_01",
                "idempotencyKey": "grant-receipt-grant-sol-mobile-042-m2-4zY1u7xK",
                "body": {
                    "to": [email["from"]],
                    "from": "grants@mermail.app",
                    "subject": "Milestone 2 Completed & Payout Confirmed — Superteam Mobile SDK",
                    "body": "Your deliverables for Milestone 2 have been verified and 2,000.00 USDC has been disbursed."
                }
            },
            {
                "draft_id": "draft_receipt_042_m2",
                "status": "saved"
            }
        )

        simulate_agent_thinking("Dispatching audit confirmation email via Mermail", 0.3)
        render_mcp_call(
            "send_email",
            {
                "mailboxId": "mb_superteam_grants_01",
                "draftId": "draft_receipt_042_m2",
                "idempotencyKey": "grant-receipt-grant-sol-mobile-042-m2-4zY1u7xK"
            },
            {
                "message_id": "msg_sent_receipt_99182",
                "status": "sent"
            }
        )

        # ── WRITE AUDIT RECEIPT TO DISK ──
        receipts_dir.mkdir(parents=True, exist_ok=True)
        receipt_path = receipts_dir / "grant-sol-mobile-042-m2.json"
        audit_receipt = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "grant_id": policy["grant_id"],
            "grant_title": policy["title"],
            "milestone_index": 2,
            "status": "SETTLED_ON_SOLANA",
            "grantee_organization": policy["grantee_organization"],
            "grantee_payout_address": policy["grantee_payout_address"],
            "commit_hash": "a3b8c1d",
            "pr_url": "https://github.com/superteam-fun/solana-mobile-sdk/pull/42",
            "scorecard": {
                "pr_status": "MERGED_PASS",
                "test_coverage": "84.6% (PASS >= 80%)",
                "documentation": "LIVE_PASS",
                "address_match": "VERIFIED_PASS"
            },
            "amount_usdc": 2000.00,
            "tx_hash": "4zY1u7xK9pLm2Nv5Qw8Rs1Tc3Ya7Bf9Ge2Hj6Kl4Np8Qr1St3Uv5Wx7Yz9Aa1Bb2",
            "explorer_url": "https://solscan.io/tx/4zY1u7xK9pLm2Nv5Qw8Rs1Tc3Ya7Bf9Ge2Hj6Kl4Np8Qr1St3Uv5Wx7Yz9Aa1Bb2",
            "remaining_cap_usdc": 2000.00,
            "signing_tier": "MAJOR_MILESTONE_HUMAN_CONSOLE_SIGN",
            "audit_ledger_signature": "audit_sig_sol_m2_98721_confirmed"
        }
        with open(receipt_path, "w", encoding="utf-8") as f:
            json.dump(audit_receipt, f, indent=2)

        print(f"  {Colors.GREEN}{Colors.BOLD}📑 LOCAL AUDIT LEDGER WRITTEN TO DISK:{Colors.RESET}")
        print(f"    Path: {Colors.CYAN}{receipt_path}{Colors.RESET}")
        print(f"    Recorded Tx: {Colors.WHITE}{audit_receipt['tx_hash'][:20]}...{Colors.RESET} │ Status: {Colors.GREEN}{audit_receipt['status']}{Colors.RESET}\n")

        print(f"  {Colors.GREEN}{Colors.BOLD}🎉 WORKFLOW COMPLETE!{Colors.RESET}")
        print(f"    • Milestone 2 Deliverables: {Colors.GREEN}Verified{Colors.RESET}")
        print(f"    • PayBox Transfer:         {Colors.GREEN}2,000.00 USDC Disbursed on Solana{Colors.RESET}")
        print(f"    • Confirmation Email:      {Colors.GREEN}Dispatched to Grantee{Colors.RESET}")
        print(f"    • Remaining Grant Cap:     {Colors.CYAN}2,000.00 USDC Updated in Ledger{Colors.RESET}\n")

    else:
        # ── SCENARIO 2: CRITERIA REJECTION & FINANCIAL LOCKOUT ──
        scorecard_rows = [
            ("1. GitHub PR Merged", "PR #42 (commit c8f12a0)", "FAIL", "CI Build Failing"),
            ("2. Test Coverage >= 80%", "68.2% branch coverage", "FAIL", "Below 80% bar"),
            ("3. Developer Documentation", "staging.docs.example/wip", "FAIL", "Draft / Incomplete"),
            ("4. Recipient Wallet Audit", "8vFtM21B6j...3xKp7L", "MATCH", "Matches Policy")
        ]
        render_scorecard_table(scorecard_rows)
        print(f"  {Colors.RED}{Colors.BOLD}🛑 EVALUATION DECISION: 3/4 CRITERIA FAILED. DISBURSEMENT PROHIBITED BY POLICY.{Colors.RESET}")

        pause_for_user("Proceed to Stage 4: Financial Lockout & PayBox Guard", auto_mode)

        # ── STAGE 4: Financial Lockout & PayBox Guard ──
        step_header(4, "Financial Lockout & PayBox Safety Guard")
        print(f"  {Colors.RED}{Colors.BOLD}🛡️  [PAYBOX FINANCIAL LOCK ACTIVATED]{Colors.RESET}")
        print(f"    • Deliverable Status:    {Colors.RED}UNVERIFIED / FAILING REQUIREMENTS{Colors.RESET}")
        print(f"    • Early Release Request: {Colors.RED}REJECTED{Colors.RESET} (Policy prohibits advance funding)")
        print(f"    • Transfer Proposal:     {Colors.BOLD}{Colors.WHITE}BLOCKED{Colors.RESET} — Zero PayBox calls will be issued.")
        print(f"    • Treasury Balance:      {Colors.GREEN}14,250.00 USDC (100% PROTECTED){Colors.RESET}")
        print(f"    • Remaining Grant Cap:   {Colors.CYAN}4,000.00 USDC (UNCHANGED){Colors.RESET}\n")

        pause_for_user("Proceed to Stage 5: Revision Request & Clarification Dispatch", auto_mode)

        # ── STAGE 5: Revision Request & Clarification Dispatch ──
        step_header(5, "Revision Request & Clarification Dispatch")
        simulate_agent_thinking("Composing itemized criteria rejection and feedback notice", 0.35)
        
        render_mcp_call(
            "save_draft",
            {
                "mailboxId": "mb_superteam_grants_01",
                "idempotencyKey": "grant-revision-grant-sol-mobile-042-m2-c8f12a0",
                "body": {
                    "to": [email["from"]],
                    "from": "grants@mermail.app",
                    "subject": "Milestone 2 Review Feedback — Deliverable Action Required (grant-sol-mobile-042)",
                    "body": "CI failing on commit c8f12a0, coverage 68.2% is below 80% threshold. Standing policy prohibits advance disbursement."
                }
            },
            {
                "draft_id": "draft_revision_042_m2",
                "status": "saved"
            }
        )

        simulate_agent_thinking("Dispatching feedback email to grantee thread via Mermail", 0.3)
        render_mcp_call(
            "send_email",
            {
                "mailboxId": "mb_superteam_grants_01",
                "draftId": "draft_revision_042_m2",
                "idempotencyKey": "grant-revision-grant-sol-mobile-042-m2-c8f12a0"
            },
            {
                "message_id": "msg_sent_revision_99183",
                "status": "sent"
            }
        )

        print(f"  {Colors.YELLOW}{Colors.BOLD}✔ REJECTION & REVISION NOTICE DISPATCHED!{Colors.RESET}")
        print(f"    • Treasury Disbursals:    {Colors.GREEN}0.00 USDC (No Funds Disbursed){Colors.RESET}")
        print(f"    • Grantee Notification:   {Colors.GREEN}Specific feedback and failing criteria sent{Colors.RESET}")
        print(f"    • Grant Status:           {Colors.YELLOW}REVISION_REQUIRED (Awaiting Contractor Fixes){Colors.RESET}\n")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run Mermail Grant Milestone Desk Live Simulation")
    parser.add_argument("--auto", action="store_true", help="Run in automated progress mode without pausing")
    parser.add_argument("--scenario", type=int, choices=[1, 2], help="Select scenario (1: Approved, 2: Rejected)")
    args = parser.parse_args()

    selected = select_scenario(auto=args.auto, cli_scenario=args.scenario)
    run_simulation(scenario=selected, auto_mode=args.auto)
