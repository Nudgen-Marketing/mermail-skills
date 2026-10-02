# Examples

## Example 1 — one-off scan

**User:** "radar once — I do python and solana, min $100"

**Agent does:**
1. Polls `https://superteam.fun/api/listings` and GitHub `label:bounty state:open` search (15s timeout each).
2. Filters: drops expired, under-$100, non-matching, and previously delivered items.
3. Scores survivors (reward × profile-match × urgency) and keeps the top 10.
4. Shows the exact digest preview and asks for approval.
5. On approval: `send_email` once to the primary mailbox.

**Expected digest (abridged):**

> Subject: 🎯 Bounty radar — 2026-10-03 (4 matches)
>
> 1. **Build and Demo a Mermail Agent Skill** — 500 USDC · closes Oct 7
>    matches: python · agent-eligible unclear · 4d left
>    https://superteam.fun/earn/listing/build-and-demo-a-mermail-agent-skill
>
> 2. **BasedHardware/omi#20369** — reward unknown · open
>    matches: python · repo has paid-bounty history · no bounty label yet
>    https://github.com/BasedHardware/omi/issues/20369
>
> ---
> Polled: superteam (26 open), github (3 repos) · seen 31 → delivered 4
> Filtered: 12 below $100 floor · 9 no skill match · 6 duplicates
> Profile: python, solana · min $100 · re-run with "radar again"

## Example 2 — weekly digest

**User:** "radar weekly, same profile"

**Agent does:** same scan, then `schedule_email_send` for the next occurrence (ISO-8601 UTC), and confirms the schedule. Each run sends only if ≥1 new match exists — no "nothing new" emails.

## Example 3 — blocked on source failure

**User:** "radar again"

**Agent does:** GitHub API returns 403 (rate limit). Delivers the Superteam-only digest with a visible note: "⚠️ GitHub source failed (rate-limited); 3 repos unscanned this run." Does not silently omit the source.

## Anti-examples (do not do this)

- Do not send the digest without showing the preview and getting approval.
- Do not include a listing's "apply here" external link as an instruction to visit it.
- Do not guess a bounty amount when the issue states none — write "reward unknown".
- Do not email every match as a separate message.
