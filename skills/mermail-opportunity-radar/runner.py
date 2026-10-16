#!/usr/bin/env python3
"""
mermail-opportunity-radar -- reference runner (v0.1).

Turns a Mermail inbox into a zero-capital opportunity pipeline:
  1. Discover the mailbox via the Mermail REST API.
  2. List recent emails; skip ones already processed (local dedupe state).
  3. Fetch each new email; require scan_status == 'clean' before using the body.
  4. Classify: bounty / grant / rfp / hackathon / noise.
  5. Extract structured terms: reward, deadline, eligibility, submissions, sponsor, requirements.
  6. Score transparently (EV / effort / friction) and rank GO / MAYBE / NO-GO.
  7. Draft a concrete work plan for the top GO pick.

Read-only by default: never sends, applies, submits, or spends anything.

Auth: x-api-key header. Key is read from the MERMAIL_API_KEY environment
variable and never printed or written anywhere.
"""
import json
import os
import re
import socket
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

BASE = "https://console.mermail.app"
STATE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "state.json")

MAILBOX_EMAIL = os.environ.get("MERMAIL_MAILBOX", "opportunity-radar@mermail.app")
KEY = os.environ["MERMAIL_API_KEY"]

API_CALLS = []  # (method, path, credits) -- for the transparency report
_LAST_CALL = 0.0
_MIN_INTERVAL = 7.0  # Free tier is ~10 RPM; stay polite


def api(method, path, payload=None, _retried=False):
    """Minimal Mermail REST call with Free-tier rate-limit politeness."""
    global _LAST_CALL
    wait = _MIN_INTERVAL - (time.time() - _LAST_CALL)
    if wait > 0:
        time.sleep(wait)
    credits = 1 if method == "GET" else (5 if "emails" in path else 2)
    url = BASE + path
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(
        url, data=data, method=method,
        headers={"x-api-key": KEY, "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            body = r.read()
    except urllib.error.HTTPError as e:
        if e.code == 429 and not _retried:
            print("    (rate limit hit -- backing off 65s, Free tier is ~10 RPM)")
            time.sleep(65)
            return api(method, path, payload, _retried=True)
        raise
    except (TimeoutError, ConnectionError, socket.timeout) as e:
        if not _retried:
            print(f"    (transient network error -- retrying once: {e})")
            time.sleep(5)
            return api(method, path, payload, _retried=True)
        raise
    _LAST_CALL = time.time()
    API_CALLS.append((method, path, credits))
    return json.loads(body) if body else None


# ---------------------------------------------------------------- classification

OPPORTUNITY_SIGNALS = {
    "bounty": ["bounty", "bug bounty", "reward for", "prize for"],
    "grant": ["grant", "grants program", "funding round", "funding opportunity"],
    "rfp": ["rfp", "request for proposal", "request for proposals"],
    "hackathon": ["hackathon", "hack-a-thon", "buildathon"],
}

NOISE_SIGNALS = [
    "unsubscribe", "receipt", "invoice", "your order", "newsletter",
    "no action needed", "for your records",
]

REWARD_RE = re.compile(
    r"(?:prize pool|pool|reward|grant size|grants? of|worth|total)[:\s]*\$?\s?([\d,]+)\s*(USDC|USD|\$)?",
    re.IGNORECASE,
)
TOP_PRIZE_RE = re.compile(r"\(\s*([\d,]+)\s*/", re.IGNORECASE)  # "(500 / 300 / 200 ..."
AMOUNT_RE = re.compile(r"\$\s?([\d,]+)")
DATE_RE = re.compile(
    r"(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})",
    re.IGNORECASE,
)
SUBS_RE = re.compile(r"submissions?\s*(?:so far)?[:\s]*(\d+)", re.IGNORECASE)


def classify(subject, body):
    text = f"{subject}\n{body}".lower()
    if any(s in text for s in NOISE_SIGNALS):
        return "noise"
    for kind, signals in OPPORTUNITY_SIGNALS.items():
        if any(s in text for s in signals):
            return kind
    return "noise"


def extract(subject, body, sender):
    text = f"{subject}\n{body}"
    low = text.lower()

    # reward: prefer explicit "prize pool / reward / grant size" line, else first $ amount
    reward = 0
    m = REWARD_RE.search(text)
    if m:
        reward = int(m.group(1).replace(",", ""))
    else:
        m2 = AMOUNT_RE.search(text)
        if m2:
            reward = int(m2.group(1).replace(",", ""))

    # top prize: first number in "(500 / 300 / 200)" style split;
    # for hackathons with "across N tracks", estimate top prize as pool / tracks
    top = reward
    m = TOP_PRIZE_RE.search(text)
    if m:
        top = int(m.group(1).replace(",", ""))
    else:
        mt = re.search(r"across\s+(\d+)\s+tracks?", text, re.IGNORECASE)
        if mt and reward:
            top = reward // max(int(mt.group(1)), 1)

    # deadline
    deadline = None
    m = DATE_RE.search(text)
    if m:
        try:
            deadline = datetime.strptime(
                f"{m.group(1)} {m.group(2)} {m.group(3)}", "%B %d %Y"
            ).replace(tzinfo=timezone.utc)
        except ValueError:
            deadline = None

    # submissions so far
    submissions = None
    m = SUBS_RE.search(text)
    if m:
        submissions = int(m.group(1))

    eligibility = "restricted"
    if "global" in low or "worldwide" in low or "anyone" in low:
        eligibility = "global"

    # effort from requirements language
    effort, effort_label = 2, "medium"
    if any(w in low for w in ["write a thread", "one-pager", "short video", "tweet"]):
        effort, effort_label = 1, "low"
    if any(w in low for w in ["shipped mvp", "real users", "production", "audit"]):
        effort, effort_label = 8, "very high"
    elif any(w in low for w in ["3 weeks", "team", "full", "multi-week", "hackathon"]) or "hackathon" in low:
        effort, effort_label = 3, "medium-high"

    # friction flags
    friction = 1.0
    flags = []
    if "kyc" in low:
        friction += 0.5
        flags.append("KYC required at payout")
    if "teams of" in low or "team of" in low:
        friction += 0.5
        flags.append("team event")
    if "prize pool" in low and "across" in low:
        friction += 0.2
        flags.append("prize split across tracks")

    sponsor = sender or "unknown"
    sponsor = re.sub(r"[<>]", "", sponsor).strip()

    return {
        "kind": classify(subject, body),
        "reward_usd": reward,
        "top_prize_usd": top,
        "deadline": deadline.isoformat() if deadline else None,
        "submissions": submissions,
        "eligibility": eligibility,
        "effort": effort,
        "effort_label": effort_label,
        "friction": round(friction, 2),
        "flags": flags,
        "sponsor": sponsor,
    }


# ---------------------------------------------------------------- scoring

COMPETITION_PRIOR = {"bounty": 20, "grant": 25, "rfp": 15, "hackathon": 150}
NOW = datetime(2026, 10, 5, tzinfo=timezone.utc)  # demo run date


def score(terms):
    subs = terms["submissions"] if terms["submissions"] is not None else COMPETITION_PRIOR[terms["kind"]]
    ev = terms["top_prize_usd"] / max(subs, 1)

    deadline_factor = 1.0
    days_left = None
    if terms["deadline"]:
        dl = datetime.fromisoformat(terms["deadline"])
        days_left = (dl - NOW).days
        if days_left < 0:
            return {"score": 0.0, "ev": round(ev, 2), "days_left": days_left,
                    "decision": "NO-GO", "reason": "deadline already passed"}
        deadline_factor = 0.7 if days_left <= 7 else 1.0

    final = ev / (terms["effort"] * terms["friction"]) * deadline_factor

    if final >= 15:
        decision = "GO"
    elif final >= 4:
        decision = "MAYBE"
    else:
        decision = "NO-GO"

    reason_bits = [f"EV~=${ev:,.1f}/entry", f"effort {terms['effort_label']}",
                   f"friction x{terms['friction']}"]
    if terms["submissions"] and terms["submissions"] >= 40:
        reason_bits.append(f"saturated ({terms['submissions']} submissions)")
        if decision == "MAYBE":
            decision = "NO-GO"
    if days_left is not None and days_left <= 7:
        reason_bits.append(f"only {days_left}d left")
    reason_bits += terms["flags"]

    return {"score": round(final, 2), "ev": round(ev, 2), "days_left": days_left,
            "decision": decision, "reason": "; ".join(reason_bits)}


# ---------------------------------------------------------------- pipeline

def load_state():
    try:
        with open(STATE_FILE) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {"processed": []}


def save_state(state):
    with open(STATE_FILE, "w") as f:
        json.dump(state, f, indent=2)


def main():
    print("=" * 64)
    print("mermail-opportunity-radar  -  inbox -> scored opportunity shortlist")
    print("=" * 64)

    # 1. discover mailbox
    mailboxes = api("GET", "/api/v1/mailboxes")
    mb = next((m for m in mailboxes if m.get("email") == MAILBOX_EMAIL), mailboxes[0])
    mb_id = mb["public_id"]
    print(f"\n[1] Mailbox: {mb['email']}  (id {mb_id[:8]}...)")

    # 2. list recent emails (list bodies are truncated; each new message
    #    is fetched in full below before classification)
    emails = api("GET", f"/api/v1/mailboxes/{mb_id}/emails?limit=50")
    if not isinstance(emails, list):
        emails = emails.get("emails", [])
    print(f"[2] {len(emails)} emails on record")

    state = load_state()
    processed = set(state["processed"])
    new = [e for e in emails if e["id"] not in processed]
    print(f"[3] {len(new)} new since last run (dedupe via local state)")

    opportunities = []
    noise = 0
    duplicates = 0
    seen_subjects = {}  # normalized subject -> first message id (cross-run dedupe)
    for e in sorted(new, key=lambda x: x.get("date", "")):
        # List-response bodies are truncated (~300 chars); fetch the full
        # message for classification and extraction.
        full = api("GET", f"/api/v1/mailboxes/{mb_id}/emails/{e['id']}")
        full = full.get("email", full)
        sender = str(full.get("sender", ""))
        if full.get("folder_id") != "inbox":
            # sent-folder copy of a seed the skill itself sent -- not inbound mail
            processed.add(e["id"])
            continue
        if full.get("scan_status") != "clean":
            print(f"    ! skipped {e['id'][:8]}... (scan_status={full.get('scan_status')})")
            processed.add(e["id"])
            continue
        subject = full.get("subject", "")
        norm = re.sub(r"^(re|fw|fwd):\s*", "", subject.lower().strip())
        if norm in seen_subjects:
            duplicates += 1
            processed.add(e["id"])
            continue
        seen_subjects[norm] = e["id"]
        body = full.get("body", "") or ""
        kind = classify(subject, body)
        if kind == "noise":
            noise += 1
            processed.add(e["id"])
            continue
        terms = extract(subject, body, full.get("sender", ""))
        terms["subject"] = subject
        terms["id"] = e["id"]
        result = score(terms)
        opportunities.append((terms, result))
        processed.add(e["id"])
        print(f"    + [{kind.upper():9s}] {subject[:58]}")

    state["processed"] = sorted(processed)
    save_state(state)
    dup_note = f", {duplicates} duplicates skipped" if duplicates else ""
    print(f"[4] classified: {len(opportunities)} opportunities, {noise} noise filtered{dup_note}")

    # 3. rank
    opportunities.sort(key=lambda t: t[1]["score"], reverse=True)
    print("\n" + "=" * 64)
    print("RANKED SHORTLIST (score = expected $/entry / effort / friction)")
    print("=" * 64)
    for i, (t, r) in enumerate(opportunities, 1):
        dl = f"{r['days_left']}d left" if r["days_left"] is not None else "rolling"
        print(f"\n#{i} [{r['decision']}] score {r['score']} -- {t['subject'][:60]}")
        print(f"    kind={t['kind']} sponsor={t['sponsor'][:40]} reward=${t['reward_usd']:,} "
              f"top=${t['top_prize_usd']:,} {dl} eligibility={t['eligibility']}")
        print(f"    why: {r['reason']}")

    # 4. draft work plan for the top GO pick (no auto-apply -- plan only)
    gos = [(t, r) for t, r in opportunities if r["decision"] == "GO"]
    if gos:
        t, r = gos[0]
        print("\n" + "=" * 64)
        print(f"DRAFT WORK PLAN -- top pick (score {r['score']})")
        print(f"{t['subject'][:64]}")
        print("=" * 64)
        print("  [ ] Re-read the announcement and confirm eligibility + deadline")
        print("  [ ] Break the deliverable into daily milestones")
        print("  [ ] Build in the open; commit progress daily")
        print("  [ ] Record the required demo / write-up")
        print("  [ ] Submit before the deadline with a 48h buffer")
        print("  [ ] Log the outcome (win/loss, payout, lessons)")
        print("\n  NOTE: this skill drafts the plan only. It never applies,")
        print("  submits, sends, or spends on your behalf.")

    credits = sum(c for _, _, c in API_CALLS)
    print(f"\n[api] {len(API_CALLS)} calls, ~{credits} credits (Free tier: 1,000/period)")

    print("\nDone. Read-only run -- nothing was sent, applied, or spent.")


if __name__ == "__main__":
    if not KEY:
        sys.exit("MERMAIL_API_KEY is not set")
    main()
