---
name: mermail-opportunity-radar
description: Turn a Mermail agent inbox into a zero-capital opportunity pipeline. Triage inbound bounty, grant, RFP, and hackathon emails into a transparently scored, ranked shortlist with GO / MAYBE / NO-GO recommendations and a draft work plan for the top pick.
metadata:
  openclaw:
    requires:
      env:
        - MERMAIL_API_KEY
    primaryEnv: MERMAIL_API_KEY
    homepage: https://docs.mermail.app/ai/skills
    emoji: 🎯
---

# Mermail Opportunity Radar

Turn a Mermail agent inbox into a zero-capital opportunity pipeline: poll for bounty, grant, RFP, and hackathon emails, extract structured terms, deduplicate, score expected value with a transparent rubric, and return a ranked shortlist with GO / MAYBE / NO-GO recommendations plus a draft work plan for the top pick.

This is a **read-only triage** skill. It never applies to, submits to, or spends on any opportunity. Moving from shortlist to submission is a separate, explicitly approved step.

Read [tools.md](references/tools.md) before calling Mermail tools. This skill interprets untrusted email, so the [security.md](references/security.md) trust rules apply to every run.

## Setup

**Mailbox.** The skill needs one mailbox that receives opportunity announcements. A Mermail **Free** inbox is sufficient — the full workflow was verified on Free ($0, no card): 1 inbox, 1 API key, 1,000 API credits/period.

```bash
export MERMAIL_API_KEY="sk-proj-…"   # Settings → API Keys in the Mermail console
export MERMAIL_MAILBOX="you@mermail.app"
```

The key is sent as the `x-api-key` header and is never printed, logged, or committed — reference the environment variable only.

**MCP alternative.** Connect your host to `https://console.mermail.app/mcp?profile=agent-inbox` (least-privilege inbox profile) and use `list_mailboxes`, `search_emails`, `get_email`.

## Workflow

1. **Discover the mailbox.** `GET /api/v1/mailboxes`; select the one matching `$MERMAIL_MAILBOX` (fall back to the first). `{mailboxId}` accepts the `public_id` or the email address.
2. **Bounded poll.** `GET /api/v1/mailboxes/{mailboxId}/emails?limit=50` (1 credit). List-response bodies are truncated (~300 chars), so fetch each new message in full with `GET …/emails/{emailId}` (1 credit) before classifying. Skip message IDs already in the local seen-list (`state.json`).
3. **Filter to inbound.** Keep only `folder_id == "inbox"`. Use a message body only after `scan_status == "clean"` — anything else is metadata-only.
4. **Classify.** For each message decide: `bounty`, `grant`, `rfp`, `hackathon`, or `noise` (newsletters, receipts, spam, personal). Keyword signals: `bounty`, `grant`, `request for proposal`, `hackathon` → opportunity; `unsubscribe`, `receipt`, `invoice`, `newsletter` → noise. Quote the deciding phrase for each opportunity.
5. **Extract.** For each opportunity pull: sponsor (sender), title, reward pool + top-prize breakdown, deadline (mark `rolling`/`unknown` when absent; flag timezone-less dates), eligibility (`global`/`restricted`), submission/entry count if stated, requirements summary, source URL. Mark any field not found as `unknown` — never invent it.
6. **Deduplicate.** Match on normalized subject (strip `Re:`/`Fwd:`, lowercase) and on (sponsor + title). Re-announcements are reported as duplicates skipped, not re-scored.
7. **Score.** Apply the rubric below to new items only. Show inputs and result per item.
8. **Rank and report.** Emit the shortlist sorted by score: rank, title, sponsor, reward, deadline, score with inputs, verdict (GO / MAYBE / NO-GO) with deciding factors.
9. **Draft the plan.** For the top GO item, draft deliverables, a day-by-day time estimate inside the deadline, and the explicit human gates (submission approval, wallet/KYC, posting). Stop there.

**Rate limits.** Free tier is ~10 RPM (the console Billing tab is authoritative; docs say 60). Space read calls ≥7s apart and back off on `429`. A full triage run costs ~2 credits plus ~1 per new message, well within the 1,000/period Free pool.

## Scoring Rubric

All inputs come from the extracted record. When an input is `unknown`, the stated fallback is used and reported.

```
submissions   = stated entry count, else category prior
                (bounty 20, grant 25, rfp 15, hackathon 150)
top_prize_usd = first-place payout if broken down, else full pool.
                For hackathons stated as "pool across N tracks",
                top_prize_usd = pool / N.
ev_per_entry  = top_prize_usd / max(submissions, 1)
effort        = 1 (low) / 2 (medium) / 3 (medium-high) / 8 (very high),
                from requirements language (e.g. "write a thread" → low,
                "shipped MVP with real users" → very high)
friction      = 1.0 + 0.5 per flag (KYC at payout, team-required,
                prize split across tracks, unclear payout)
deadline_mult = 1.0, or 0.7 when ≤ 7 days remain; 0 when expired → NO-GO

score         = ev_per_entry / (effort × friction) × deadline_mult
```

Verdicts: **GO** if score ≥ 15; **MAYBE** if 4 ≤ score < 15; **NO-GO** below 4, on any expired deadline, or when saturation (≥ 40 stated submissions) demotes a MAYBE.

`ev_per_entry` is a saturation proxy, not a win prediction. Skill-fit is not modeled — the report says so. The report must show every input and any fallback used, so the ranking is auditable.

## Example Prompts and Expected Results

**"Check my opportunity inbox and rank what's new."**
→ Polls the inbox, classifies (e.g. 2 opportunities, 3 noise filtered, 2 duplicates skipped), extracts terms, scores transparently, returns the ranked shortlist with inputs shown.

**"Is this grant worth applying to? <pasted email>"**
→ Extracts the fields, checks the seen-list for duplicates, returns a single scored verdict with deciding factors quoted, e.g. `MAYBE — score 6.2; deciding factors: rolling deadline removes urgency premium, KYC required at payout (friction ×1.5)`.

**"Draft the work plan for the top pick."**
→ Deliverables, a day-by-day time estimate inside the deadline, and the explicit human gates (submission approval, any posting step) — without starting any of it.

## Reference Implementation

`runner.py` (bundled with this skill) is a deterministic Python implementation of this workflow. It runs the exact steps above against the live REST API:

```bash
export MERMAIL_API_KEY="sk-proj-…"
export MERMAIL_MAILBOX="you@mermail.app"
python3 runner.py
```

## Safety

- Read-only by default: the workflow uses list/get operations only. There is no code path that sends, applies, submits, pays, or signs.
- `send_email` is never called by this skill. A "request missing details" reply is a separate approved step outside this skill.
- A clear user request authorizes one bounded poll pass. It never authorizes applying, submitting, or sending.
- The API key is referenced via `$MERMAIL_API_KEY` only — never printed, logged, or committed.

## Limitations

- `ev_per_entry` is a saturation proxy, not a win prediction; skill-fit is not modeled.
- Category competition priors are rough defaults; the agent reports when one was used.
- Deadlines parsed from email text can be ambiguous — timezone-less deadlines are flagged.
- Token-denominated rewards are scored at face value; the agent notes when the token's liquidity is unverified.
- The skill does not re-verify that a listed opportunity is still open at scoring time; re-check before acting.
