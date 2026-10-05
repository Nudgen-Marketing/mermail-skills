# Follow-up Radar workflows

## Sequence: scan → score → draft → approve → send

### 1. Discover

`list_mailboxes` → pick the mailbox the user sends from. Record its `public_id` and email. If several fit, ask.

### 2. Scan

One bounded `search_emails` over the sent folder:

- `folder: "sent"`, `date_start`/`date_end` covering the window (default: last 14 days).
- `sortColumn: "date"`, `sortDirection: "DESC"`, `limit` ≤ 100, `metadata_only: true`.

For each sent message, call `get_thread` (or a targeted `search_emails` on the thread) and apply the stalled test:

> **Stalled** = newest message in thread is your outbound AND it is older than the silence threshold (default 5 days).

Disqualify immediately when any inbound message is newer than your last outbound.

### 3. Score

Score each stalled thread 0–100 with this deterministic rubric (show the math in the table):

| Signal | Points |
| --- | --- |
| Base | 50 |
| Silent 7+ days | +20 |
| Silent 14+ days | +10 more |
| Deal language in subject/body (`proposal`, `quote`, `pricing`, `contract`, `invoice`, `demo`, `pilot`) | +15 |
| Warm thread: ≥1 inbound reply earlier in the thread before it went quiet | +10 |
| Multiple recipients on the outbound (buying committee) | +5 |

**Hard exclusions (never follow up):** any inbound reply after your last outbound; `unsubscribe`/`opt-out` language anywhere in the thread; bounce or delivery-failure notices; out-of-office / autoresponder loops; threads already carrying the `followup-sent` label; recipients on a do-not-contact list the user named.

Default draft threshold: score ≥ 40. The user can raise or lower it per run.

**Worked example:** a "Proposal for Acme Corp" thread, 10 days silent, no reply, warm thread (one inbound reply before it went quiet): 50 base + 20 (7+ days) + 15 (deal language) + 10 (warm thread) = **95**. A 3-day-old thread with no deal language scores 50 base − nothing = 50, but fails the 5-day silence minimum, so it is excluded before scoring.

### 4. Present

Ranked table, one row per thread:

| Recipient | Subject | Days silent | Score | Top signal |
| --- | --- | --- | --- | --- |

Ask which threads to draft for (or take the user's "top N"). Never draft for the whole list unasked.

### 5. Draft

For each chosen thread: `get_email` on the last outbound to quote one concrete line, then `save_draft`:

- Subject: `Re: <original subject>`
- Body: under 120 words, references the quoted line, one clear call to action, no guilt-tripping.
- Tone default: warm and brief. Match the thread's existing tone (formal stays formal).

Show the user the exact draft text for every thread. Drafts are internal writes; they do not send.

### 6. Approve and send

Only on the user's explicit per-thread approval:

- Immediate: `reply_to_email` with `emailId` = the last outbound message, `idempotencyKey: followup-<threadId>-<yyyymmdd>`.
- Timed: `schedule_email_send` with `scheduled_send_at` as a future ISO-8601 datetime.

Then `move_email` the thread under the `followup-sent` label (create it once with `create_custom_label`).

### 7. Report

Summarize: threads scanned, stalled found, drafts created, sent, scheduled, skipped (with reasons), and anything still waiting on the user. Never claim a follow-up was sent when it is still a draft.
