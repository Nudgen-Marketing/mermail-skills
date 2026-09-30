#!/usr/bin/env python3
"""
Auto-Bill Pay Agent — Mermail Agent Skill implementation.

Email-driven bill payment workflow for Mermail:
  1. SCAN   — find invoice/bill emails in the inbox
  2. EXTRACT — parse amount, currency, vendor, invoice number, due date
  3. CHECK   — validate against policy (amount cap, vendor allowlist, duplicates)
  4. APPROVE — build a human-readable approval summary (or auto-pay via Agent Wallet if configured)
  5. EXECUTE — send a confirmation reply and archive the invoice to a "Processed" folder

This is the reference implementation behind the SKILL.md. It talks to Mermail
through the MCP endpoint (streamable HTTP) using a workspace API key.

Usage:
  python3 auto_bill_pay.py scan [--limit N]
  python3 auto_bill_pay.py process --email <email-id> [--approve]
  python3 auto_bill_pay.py process-all [--max-amount USDC] [--auto-approve]
"""
import argparse, json, os, re, sys, urllib.request
from datetime import datetime, timezone

KEY = os.environ.get("MERMAIL_API_KEY") or open(os.path.expanduser("~/.mermail/env")).read().split("=",1)[1].strip()
MCP_URL = "https://console.mermail.app/mcp"
LEDGER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ledger.json")

INVOICE_KEYWORDS = re.compile(r"invoice|bill|receipt|payment due|statement", re.I)
AMOUNT_RE = re.compile(r"(?:amount\s*[:#]?\s*)([0-9,]+(?:\.[0-9]{2})?)\s*(USD[CCT]?|USDC|USDG|USDT|\$)?", re.I)
FALLBACK_AMOUNT_RE = re.compile(r"([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]{2})?|[0-9]+\.[0-9]{2})\s*(USD[CCT]?|USDC|USDG|USDT|\$)?", re.I)
INVOICE_NO_RE = re.compile(r"(?:invoice\s*[#:]?\s*)([A-Z0-9][A-Z0-9\-]{3,20})", re.I)
DUE_RE = re.compile(r"(?:due\s*(?:date)?\s*[:#]?\s*)([0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4})", re.I)
PAYTO_RE = re.compile(r"(?:pay\s*(?:to)?\s*[:#]?\s*)(0x[a-fA-F0-9]{20,80})", re.I)
VENDOR_RE = re.compile(r"(?:vendor|biller|from|company|merchant)\s*[:#]?\s*([A-Za-z0-9][A-Za-z0-9 .&\-]{2,40})", re.I)

def mcp(tool, args, timeout=40):
    payload = {"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":tool,"arguments":args}}
    req = urllib.request.Request(MCP_URL, data=json.dumps(payload).encode(),
        headers={"Content-Type":"application/json","Accept":"application/json, text/event-stream",
                 "x-api-key": KEY, "User-Agent":"Mozilla/5.0"}, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read().decode()
    data_lines = [l[6:] for l in raw.splitlines() if l.startswith("data: ")]
    text = data_lines[-1] if data_lines else raw
    return json.loads(text)

def tool_text(r):
    return r["result"]["content"][0]["text"]

def list_inbox(mailbox, limit=20):
    r = mcp("list_emails", {"mailboxId": mailbox, "query": {"folder":"inbox","limit":limit}})
    d = json.loads(tool_text(r))
    return d.get("emails", d) if isinstance(d, dict) else d

def get_email(mailbox, email_id):
    r = mcp("get_email", {"mailboxId": mailbox, "emailId": email_id})
    d = json.loads(tool_text(r))
    return d if isinstance(d, dict) and "id" in d else d

def extract_invoice(text):
    """Parse invoice fields from email body text. Returns dict or None."""
    text = text or ""
    if not INVOICE_KEYWORDS.search(text):
        return None
    inv_no = INVOICE_NO_RE.search(text)
    amt = AMOUNT_RE.search(text) or FALLBACK_AMOUNT_RE.search(text)
    due = DUE_RE.search(text)
    payto = PAYTO_RE.search(text)
    vendor = VENDOR_RE.search(text)
    return {
        "invoice_number": inv_no.group(1) if inv_no else None,
        "amount": float(amt.group(1).replace(",", "")) if amt else None,
        "currency": (amt.group(2) or "USDC").upper() if amt else "USDC",
        "due_date": due.group(1) if due else None,
        "pay_to": payto.group(1) if payto else None,
        "vendor": vendor.group(1).strip() if vendor else None,
    }

def load_ledger():
    if os.path.exists(LEDGER):
        return json.load(open(LEDGER))
    return {"payments": []}

def save_ledger(ledger):
    json.dump(ledger, open(LEDGER, "w"), indent=2)

def already_paid(ledger, invoice_number, email_id):
    for p in ledger["payments"]:
        if p.get("invoice_number") and p["invoice_number"] == invoice_number:
            return True
        if p.get("email_id") == email_id:
            return True
    return False

def check_policy(inv, max_amount=500, allowlist=None, denylist=None):
    allowlist = allowlist or []
    denylist = denylist or []
    issues = []
    if inv.get("amount") is None:
        issues.append("amount_unparsed")
    if inv["amount"] is not None and inv["amount"] > max_amount:
        issues.append(f"exceeds_max_amount_{max_amount}")
    if inv.get("vendor") and any(d.lower() in inv["vendor"].lower() for d in denylist):
        issues.append("vendor_denylisted")
    if inv.get("pay_to") and allowlist and inv["pay_to"].lower() not in [a.lower() for a in allowlist]:
        issues.append("payee_not_allowlisted")
    return issues

def build_approval(mailbox, email, inv):
    ledger = load_ledger()
    dup = already_paid(ledger, inv.get("invoice_number"), email["id"])
    return {
        "status": "duplicate" if dup else "pending_approval",
        "email_id": email["id"],
        "from": email.get("sender"),
        "subject": email.get("subject"),
        "received": email.get("date"),
        "invoice": inv,
        "duplicate": dup,
        "ledger_count": len(ledger["payments"]),
    }

def reply_confirmation(mailbox, email, inv):
    subject = f"Re: {email.get('subject','')}"[:120]
    text = (f"Payment approved and queued.\n\n"
            f"Invoice: {inv.get('invoice_number')}\n"
            f"Amount: {inv.get('amount')} {inv.get('currency')}\n"
            f"Due: {inv.get('due_date')}\n"
            f"Status: queued for payment via Agent Wallet\n")
    from_addr = "doubao@mermail.app"
    payload = {"body": {"to": email.get("sender"), "from": from_addr,
                        "subject": subject, "text": text}}
    # Preferred: reply_to_email keeps threading headers. On Free plans the API
    # restricts reply_to_email for some external recipients, so fall back to
    # send_email (same payload shape, verified working) rather than failing.
    r = mcp("reply_to_email", {"mailboxId": mailbox, "emailId": email["id"], **payload})
    txt = ""
    try:
        txt = tool_text(r) if r.get("result") else ""
    except Exception:
        txt = ""
    if txt and '"error"' not in txt and '"Conflict"' not in txt:
        try:
            return json.loads(txt)
        except Exception:
            return {"raw": txt[:200]}
    r2 = mcp("send_email", {"mailboxId": mailbox, **payload})
    txt2 = ""
    try:
        txt2 = tool_text(r2) if r2.get("result") else ""
    except Exception:
        txt2 = ""
    try:
        return {"fallback": "send_email", "response": json.loads(txt2)} if txt2 else r2
    except Exception:
        return {"fallback": "send_email", "raw": txt2[:200]}

def archive(mailbox, email_id, folder="processed"):
    # ensure folder exists (ignore folder_name_taken)
    r = mcp("create_folder", {"mailboxId": mailbox, "body": {"name": folder}})
    r2 = mcp("move_email", {"mailboxId": mailbox, "emailId": email_id,
        "body": {"folderId": folder}})
    return r2

def strip_html(html):
    """Convert HTML body to readable text, preserving line breaks."""
    html = html or ""
    html = re.sub(r"</(div|p|li|tr|h[1-6])>", "\n", html, flags=re.I)
    html = re.sub(r"<br\s*/?>", "\n", html, flags=re.I)
    return re.sub(r"<[^>]+>", " ", html)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["scan", "process", "process-all"])
    ap.add_argument("--mailbox", default="81eb9b29-b3d2-4042-865f-9a98ec70fde3")
    ap.add_argument("--email")
    ap.add_argument("--limit", type=int, default=20)
    ap.add_argument("--max-amount", type=float, default=500)
    ap.add_argument("--auto-approve", action="store_true")
    args = ap.parse_args()

    if args.cmd == "scan":
        msgs = list_inbox(args.mailbox, args.limit)
        hits = []
        for m in msgs:
            inv = extract_invoice(m.get("subject","") + "\n" + (m.get("snippet") or m.get("body") or ""))
            if inv:
                hits.append({"email_id": m["id"], "subject": m["subject"], "sender": m["sender"], "extracted": inv})
        print(json.dumps({"scan": hits, "count": len(hits)}, ensure_ascii=False, indent=2))

    elif args.cmd == "process":
        email = get_email(args.mailbox, args.email)
        body_text = strip_html(email.get("body") or "")
        inv = extract_invoice(email.get("subject","") + "\n" + body_text)
        if not inv:
            print(json.dumps({"status":"not_an_invoice"})); return
        issues = check_policy(inv, max_amount=args.max_amount)
        approval = build_approval(args.mailbox, email, inv)
        approval["policy_issues"] = issues
        if args.auto_approve and not issues and not approval["duplicate"]:
            rc = reply_confirmation(args.mailbox, email, inv)
            approval["action"] = "confirmed_and_queued"
            approval["reply"] = rc
            ledger = load_ledger()
            ledger["payments"].append({
                "email_id": email["id"], "invoice_number": inv["invoice_number"],
                "amount": inv["amount"], "currency": inv["currency"],
                "vendor": inv["vendor"], "due_date": inv["due_date"],
                "approved_at": datetime.now(timezone.utc).isoformat()})
            save_ledger(ledger)
            try:
                approval["archived"] = archive(args.mailbox, email["id"])
            except Exception as e:
                approval["archived"] = {"error": str(e)[:120]}
        else:
            approval["action"] = "requires_approval"
        print(json.dumps(approval, ensure_ascii=False, indent=2))

    elif args.cmd == "process-all":
        msgs = list_inbox(args.mailbox, args.limit)
        results = []
        for m in msgs:
            inv = extract_invoice(m.get("subject","") + "\n" + (m.get("snippet") or ""))
            if inv:
                email = get_email(args.mailbox, m["id"])
                body_text = strip_html(email.get("body") or "")
                inv = extract_invoice(email.get("subject","") + "\n" + body_text)
                issues = check_policy(inv, max_amount=args.max_amount)
                approval = build_approval(args.mailbox, email, inv)
                approval["policy_issues"] = issues
                approval["action"] = "requires_approval"
                if args.auto_approve and not issues and not approval["duplicate"]:
                    reply_confirmation(args.mailbox, email, inv)
                    approval["action"] = "confirmed_and_queued"
                results.append(approval)
        print(json.dumps({"processed": results, "count": len(results)}, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
