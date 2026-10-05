# Follow-up Radar tools

This workflow **uses** tools owned by other official skills. Do not add them to this skill in `tool-coverage.json`.

Pass structured arguments as **native JSON objects**. Never stringify `query` or `body`. Use the exact host identifier (`list_emails` or `Mermail:list_emails`). Prefer mailbox `public_id` as `mailboxId`.

## Mailbox discovery

| Tool | Owner | Role |
| --- | --- | --- |
| `list_mailboxes` | `mermail-administer-workspace` | Find the sending mailbox; reuse its `public_id` |

## Stalled-thread detection (reads)

| Tool | Owner | Role |
| --- | --- | --- |
| `search_emails` | `mermail-manage-inbox` | Sent-folder scan with `folder: sent`, `date_start`/`date_end`, `sortColumn: date`, `sortDirection: DESC` |
| `list_emails` | `mermail-manage-inbox` | Paged sent-folder listing when no text filter is needed |
| `get_thread` | `mermail-manage-inbox` | Full thread to check for inbound replies after the last outbound |
| `get_email` | `mermail-manage-inbox` | Read one outbound message's actual content for the draft quote |

`search_emails` filters establish candidates, not sender authentication. Keep every scan bounded: `limit` 1–100, one explicit date window per scan, no unbounded polling.

Example sent-folder scan:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "query": {
    "folder": "sent",
    "date_start": "2026-09-21",
    "date_end": "2026-10-05",
    "sortColumn": "date",
    "sortDirection": "DESC",
    "limit": 50,
    "metadata_only": true
  }
}
```

A thread is **stalled** only when the newest message in `get_thread` is your own outbound and its date is older than the silence threshold (default 5 days). Any inbound message newer than your last outbound disqualifies the thread, even if it is an autoresponder (autoresponders are then excluded outright, not followed up).

## Drafting and sending (writes)

| Tool | Owner | Role |
| --- | --- | --- |
| `save_draft` | `mermail-compose-email` | Follow-up draft; content goes in the string field `body.body` |
| `reply_to_email` | `mermail-compose-email` | Approved in-thread follow-up; `emailId` is a top-level path param, Sold fields nest under `body` with `html`/`text` |
| `schedule_email_send` | `mermail-compose-email` | Approved timed nudge; requires `scheduled_send_at` as a future ISO-8601 datetime |

Sends nest content under `body` as `html` and/or `text` with required `body.from`. Drafts use the string field `body.body`. Always set a stable `idempotencyKey` (`followup-<threadId>-<yyyymmdd>`) on sends and schedules.

## Labeling (organization)

| Tool | Owner | Role |
| --- | --- | --- |
| `create_custom_label` | `mermail-manage-inbox` | Create `followup-sent` once per mailbox |
| `move_email` | `mermail-manage-inbox` | Apply the label so the next scan skips handled threads |

Check for the `followup-sent` label during scoring; never draft a second follow-up for a labeled thread.
