# Tools

All tools below are ordinary API-key business tools (Mermail free-tier `MERMAIL_API_KEY`
catalog). Nothing in this skill needs Agent Wallet / PayBox OAuth.

## Conventions

- Pass `query` and `body` as native JSON objects, never a stringified blob.
- Use the exact tool identifier the current host exposes (bare `list_emails` or a
  host-qualified form such as `Mermail:list_emails`). Do not add, strip, or invent a prefix.
- Resolve `mailboxId` from `list_mailboxes`, preferring its `public_id`.

## Tool notes

| Tool | Purpose | Risk |
| --- | --- | --- |
| `list_mailboxes` | resolve the billing mailbox | read |
| `list_emails` / `search_emails` | find failed-payment notifications and check Sent for prior dunning sends | read |
| `get_email` | read one message's headers/body to extract the provider event id | read |
| `update_email` | apply a `dunning:<event_id>:attempt-N` or `dunning:closed` custom label to a source message | read+write, non-destructive |
| `list_custom_labels` / `create_custom_label` | create the `dunning:*` label family once if it does not exist | read+write, non-destructive |
| `send_email` | send exactly one recovery email per event, keyed by `idempotencyKey` | external-effect |

`send_email` is the only external-effect tool this skill calls. It is never called without a
prior user-approved preview (see [security.md](security.md)).

## Idempotency key shape — corrected against a live run (09.09.2026)

`idempotencyKey` (min 8 / max 255 chars) is sent as `Idempotency-Key` and is scoped to the
**identical method, path, query, and body** — not just the string itself. Measured against
the real MCP server, a replay is **not** a silent no-op: it returns a hard tool error,
`{"error":"idempotency_replay_conflict","code":"idempotency_replay_conflict"}`, and no second
message is queued or delivered. Verified end to end: one `send_email` call with
`idempotencyKey="dunning-<event_id>-attempt-1"` queued the message (`status:"queued"`, a real
`id`), the identical second call returned the conflict error, and the mailbox's own Sent folder
(`list_emails` with `query.folder:"sent"`) still showed `totalCount: 1` — confirmed further by
the recovery inbox receiving exactly one copy.

Treat `idempotency_replay_conflict` as **success-already-happened**, not as a failure to
surface to the user: on this error, do not retry with a new key: the original send already
went out. This skill still computes the key itself (`dunning-<event_id>-attempt-<n>`) rather
than relying only on Mermail catching the replay, because the check in step 4 of
[SKILL.md](../SKILL.md) must also decide whether to build the email at all, before any call is
made and before a Mermail-side dedup record exists.

## Examples

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "idempotencyKey": "dunning-evt_1P8xJ2-attempt-1",
  "body": {
    "to": "customer@example.com",
    "from": "billing@yourmailbox.mermail.app",
    "subject": "Your last payment did not go through",
    "text": "Hi — the charge for your Pro plan ($29.00) did not go through on 2026-09-08..."
  }
}
```

Do not pass `"body": "{\"to\":...}"` as a string.
