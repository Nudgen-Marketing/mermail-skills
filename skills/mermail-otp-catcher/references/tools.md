# Tool reference — mermail-otp-catcher

All Mermail operations go through the `mermail` MCP server. Confirm it is
connected first (`https://console.mermail.app/mcp`).

## Mailbox discovery (run once per session)

| Intent | Tool | Notes |
|---|---|---|
| List mailboxes | `list_mailboxes` | Returns mailboxes with `public_id`. Cache the result. |
| Get mailbox details | `get_mailbox` | Only if you need quotas or settings. |

Prefer the mailbox `public_id` as `mailboxId` in every subsequent call.

## Reading email

| Intent | Tool | Notes |
|---|---|---|
| Search emails | `search_emails` | Params: `mailboxId`, `query` (e.g. `"verification code"`, sender domain), `unreadOnly: true`, `since: <30 min ago>`. Pass `query` as a native object/string per MCP schema — never stringified JSON. |
| Get full email | `get_email` | Params: `mailboxId`, `emailId`. Returns subject, body (text + html), headers, timestamp. |

### Code-extraction patterns (apply to subject + text body)

1. `\b\d{4,8}\b` — bare numeric code (most common: 6 digits).
2. `(code|passcode|OTP)[\s:is]+(\d{4,8})` — labeled code.
3. Expiry: `(expir\w+|valid for)[^\n]{0,40}` — capture the window ("10 minutes").
4. Service: `From` name, or first `<b>Brand</b>`-style mention in body, or sender domain.

If the body is HTML-only, strip tags before matching. If both text and HTML exist, prefer text.

## Labeling (safe write)

| Intent | Tool | Notes |
|---|---|---|
| Create label | `create_custom_label` | Params: `mailboxId`, `name: "otp-processed"`, color optional. Idempotent — ignore "already exists". |
| Apply label / move | `move_email` or label-apply tool | Params: `mailboxId`, `emailId`, `label: "otp-processed"`. |

Labels are non-destructive and reversible. This skill never deletes email.

## Tools this skill does NOT use

- `send_email`, `reply_to_email`, `save_draft` — no outbound mail, ever.
- Any `paybox_*` / wallet tool — no money movement.
- `prepare_destructive_action` — nothing here is destructive.
