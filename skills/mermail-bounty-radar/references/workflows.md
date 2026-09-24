# Workflows

## 1. Criteria intake

1. Take criteria from the current user request when present: skills, minimum reward, chains/platforms, excluded sponsors, digest schedule.
2. Otherwise run one narrow `search_emails` for a preferences thread (for example subject contains "bounty criteria"), then a single `get_email` for the one unambiguous match. Require `scan_status` of `clean`.
3. If no criteria exist anywhere, ask once. Proceed on defaults (minimum reward $100, future deadlines only) only with explicit user approval.
4. Record the frozen criteria in the summary. Later steps must not widen them silently.

## 2. Board fetch and scoring

Configured boards (public, no credentials):

| Board | Endpoint | Notes |
| --- | --- | --- |
| Superteam Earn | `GET https://earn.superteam.fun/api/listings` + `Accept: application/json` | Returns open listings with title, reward, token, deadline, sponsor, submission count |
| Algora org pages | `GET https://console.algora.io/org/<slug>/bounties` | Per-org HTML; low volume, secondary source |

Scoring rubric (fit points, higher is better):

| Signal | Rule |
| --- | --- |
| Reward known | Required. Unparseable amounts stay `null`; the bounty is excluded, never estimated |
| Deadline | Must be in the future; sooner deadlines rank above later ones at equal fit |
| Skills overlap | Title/sponsor text matches at least one recorded skill |
| Minimum reward | Below minimum means dropped, even with strong overlap |
| Submissions | Fewer submissions rank above crowded ones at equal fit |

Drop expired listings, listings below the minimum reward, and listings with unknown rewards. Keep at most 10 rows for a digest; note the total scanned count separately.

## 3. Digest draft and send

1. Build the digest body: one row per shortlisted bounty with title, reward plus token, absolute deadline with days remaining, one-line fit reason, and board URL.
2. Preview the full digest (`from` = hunter mailbox email, exact To, subject, body). Obtain approval.
3. `save_draft` first. Then, only after a second explicit confirmation naming the send, call `send_email`/`reply_to_email`, or `schedule_email_send` with ISO-8601 UTC.
4. One idempotency key per approved digest. If a step returns uncertainty, inspect state once before continuing; never retry a send blindly.

## 4. Claim tracking

1. Watch the reply thread for messages shaped like "claim <bounty name>".
2. Answer with a checklist only: proof the board requires, submit URL, deadline, and what is still missing.
3. Never submit claims to boards on the user's behalf. Never invent submission steps; quote the board.
