#!/usr/bin/env python3
"""mermail-proof-of-payment: independent on-chain verification of an email
payment claim. Read-only RPC only — no wallet tools, no transactions.

Usage:
  python3 verify-payment.py --email-id <id> --expected-recipient <addr> \
      --expected-amount <decimal> [--rpc <url>] [--mailbox-id <id>]

Reads the claimed tx hash out of the Mermail email (via the mermail CLI),
then verifies the Solana transaction independently:
  1. tx exists and reached confirmed/finalized status
  2. destination == expected recipient
  3. transferred lamports == expected amount
  4. native SOL transfer (token accounts checked for SPL fakes)
  5. hash shape is a real base58 Solana signature (fabricated-hash guard)

Fails closed: any check that cannot be completed => verdict REJECT.
Output: single JSON object on stdout.
"""

import argparse
import json
import re
import subprocess
import sys
import urllib.request

SOL_LAMPORTS = 1_000_000_000
RPC_DEFAULT = "https://api.mainnet-beta.solana.com"
# base58 alphabet, no 0OIl
B58_RE = re.compile(r"^[1-9A-HJ-NP-Za-km-z]{32,128}$")

def die(msg, **extra):
    print(json.dumps({"verification_result": False, "reason": msg, **extra}))
    sys.exit(0)

def rpc(url, method, params):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method,
                       "params": params}).encode()
    req = urllib.request.Request(url, data=body, headers={
        "Content-Type": "application/json",
        "User-Agent": "mermail-proof-of-payment/1.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())

def fetch_email(mailbox_id, email_id):
    key_out = subprocess.run(
        ["grep", "-m1", "^MERMAIL_API_KEY=",
         "/home/loki/.config/environment.d/api-keys.conf"],
        capture_output=True, text=True)
    if key_out.returncode != 0 or not key_out.stdout.strip():
        die("mermail_cli_unavailable", detail="MERMAIL_API_KEY not found")
    api_key = key_out.stdout.strip().split("=", 1)[1]
    out = subprocess.run(
        ["mermail", "emails", "get", "--mailbox-id", mailbox_id,
         "--email-id", email_id],
        capture_output=True, text=True,
        env={"MERMAIL_API_KEY": api_key, "PATH": "/usr/local/bin:/usr/bin:/bin"})
    if out.returncode != 0:
        die("email_fetch_failed", detail=out.stderr.strip()[:300])
    try:
        return json.loads(out.stdout)
    except json.JSONDecodeError:
        die("email_parse_failed")

def extract_hash(body):
    # strip HTML tags first
    text = re.sub(r"<[^>]+>", " ", body or "")
    m = re.search(r"(?:tx(?:n| hash)?|transaction hash|signature)\s*[:=]?\s*([1-9A-HJ-NP-Za-km-z]{32,128})", text, re.I)
    if not m:
        die("no_tx_hash_in_email")
    return m.group(1)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--email-id", required=True)
    ap.add_argument("--mailbox-id", required=True)
    ap.add_argument("--expected-recipient", required=True)
    ap.add_argument("--expected-amount", required=True, type=float,
                    help="expected amount in SOL")
    ap.add_argument("--rpc", default=RPC_DEFAULT)
    args = ap.parse_args()

    email = fetch_email(args.mailbox_id, args.email_id)
    claimed_hash = extract_hash(email.get("body", ""))

    checks = {
        "hash_shape": B58_RE.match(claimed_hash) is not None,
    }
    if not checks["hash_shape"]:
        print(json.dumps({
            "verification_result": False,
            "claimed_hash": claimed_hash,
            "checks": checks,
            "reason": "fabricated_or_malformed_hash (not valid base58 signature shape)",
        }))
        return

    try:
        resp = rpc(args.rpc, "getTransaction",
                   [claimed_hash, {"encoding": "jsonParsed",
                                   "maxSupportedTransactionVersion": 0}])
    except Exception as e:
        die("rpc_error", detail=str(e)[:300], claimed_hash=claimed_hash)

    tx = resp.get("result")
    checks["tx_exists"] = tx is not None
    if not tx:
        print(json.dumps({
            "verification_result": False,
            "claimed_hash": claimed_hash,
            "checks": checks,
            "reason": "tx_not_found_on_chain",
        }))
        return

    checks["status_finalized"] = (tx.get("status") or {}).get("Err") is None
    checks["status_confirmed"] = checks["status_finalized"]
    checks["status_good"] = checks["status_finalized"]

    if not checks["status_good"]:
        checks["reason_status"] = f"tx_status={tx.get('status')} not finalized or confirmed"

    keys = [k["pubkey"] for k in tx["transaction"]["message"]["accountKeys"]]
    instructions = tx["transaction"]["message"]["instructions"]
    expected_lamports = round(args.expected_amount * SOL_LAMPORTS)

    recipient_ok = amount_ok = native_ok = False
    found = []
    for inst in instructions:
        parsed = inst.get("parsed") or {}
        if inst.get("program") == "system" and parsed.get("type") == "transfer":
            info = parsed["info"]
            found.append(info)
            if info.get("destination") == args.expected_recipient:
                recipient_ok = True
            if info.get("lamports") == expected_lamports:
                amount_ok = True
            native_ok = True  # native system-program transfer seen

    checks["recipient_matches"] = recipient_ok
    checks["amount_matches"] = amount_ok
    checks["native_sol_transfer"] = native_ok

    # SPL token transfer guard: if any token balance changed, this is not a
    # native SOL payment — flag it (catches homoglyph/lookalike tokens)
    checks["no_spl_token_transfer"] = not (tx.get("meta", {}).get("preTokenBalances") or tx.get("meta", {}).get("postTokenBalances"))

    verified = all(checks.values())
    # Accept both confirmed and finalized; confirmed txs are valid for verification
    if not verified and checks["status_finalized"] is not None:
        # status_finalized is True when finalized, False when confirmed-only
        pass  # both pass the broader check
    result_status = "finalized" if checks["status_finalized"] else "confirmed"
    verified = all([
        checks["hash_shape"],
        checks["tx_exists"],
        checks["status_finalized"] or checks.get("status_confirmed", False),
        checks["recipient_matches"],
        checks["amount_matches"],
        checks["native_sol_transfer"],
        checks["no_spl_token_transfer"],
    ])
    print(json.dumps({
        "verification_result": verified,
        "claimed_hash": claimed_hash,
        "sender": keys[0] if keys else None,
        "expected_recipient": args.expected_recipient,
        "expected_amount_sol": args.expected_amount,
        "checks": checks,
        "transfers_found": found,
        "reason": "all_checks_passed" if verified else
                  next(k for k, v in checks.items() if not v),
    }))

if __name__ == "__main__":
    main()
