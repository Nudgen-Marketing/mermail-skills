# Tools

This skill owns exactly these nine webhook tools. Ownership is unique in `tool-coverage.json`: no other focused
skill claims them, and this skill must not claim tools from another domain.

## Conventions

- Pass structured arguments as **native JSON objects**. Never stringify an object into a string field such as
  `query`, `filter`, or `payload`.
- Use the exact tool identifier exposed by the current host (for example `list_webhooks` or a host-qualified
  form like `Mermail:list_webhooks`). Do not manually add, strip, or invent prefixes inconsistently.
- Read the live schema from `tools/list` before the first call of a session. Parameter names, event-type
  enumerations, and pagination defaults come from the server, not from this document.
- Prefer mailbox `public_id` as the mailbox scope when the subscription is mailbox-scoped, so the event set
  cannot silently widen to the whole workspace.
- Identify a subscription by its webhook id or its exact target URL. Never by its index in a list.

## Tool notes

| Tool | Purpose | Risk |
| --- | --- | --- |
| `list_webhooks` | Enumerate registered endpoints in scope, with event types and active state | read |
| `get_webhook` | Read one subscription's registered configuration and secret presence | read |
| `list_webhook_deliveries` | Read delivery attempts for a subscription, including the receiver's response status | read |
| `create_webhook` | Register a new endpoint and event set (standing external effect) | external-effect |
| `update_webhook` | Change a subscription's target URL, event types, or active state | external-effect |
| `test_webhook` | Emit a synthetic event to prove the receiver path works end to end | external-effect |
| `retry_webhook_delivery` | Re-attempt one specific failed delivery, at most once | external-effect |
| `rotate_webhook_secret` | Issue a new signing secret and invalidate the previous one | external-effect |
| `delete_webhook` | Remove a subscription permanently | destructive |

`prepare_destructive_action` is not owned by this domain. It is the shared confirmation tool, and its
short-lived token must be bound to the exact destructive tool and arguments before `delete_webhook` runs.

## Reads

- Keep pages bounded. Ask a specific question ("did the last three attempts succeed?") rather than crawling every
  attempt a subscription has ever produced.
- A delivery record's value is in the receiver's response status and the attempted timestamp, not in the request
  payload. Report those first.
- `get_webhook` may indicate that a secret exists. It must never be used to display the secret, and the tool's
  output should be summarized as a boolean.

## Writes

- Before any write, resolve and state: target URL, event types, scope (workspace or mailbox), and whether the
  subscription already exists. A write that cannot state those four things is not ready.
- `test_webhook` is the correct way to prove a path. Do not create a second subscription to test whether the
  first one works.
- `update_webhook` is the correct way to pause a subscription: set it inactive rather than deleting it, so the
  history and the secret survive an incident.
- `rotate_webhook_secret` must be paired with an explicit statement that receivers holding the previous secret
  stop verifying successfully until they are redeployed.
- `delete_webhook` requires a fresh `prepare_destructive_action` token for the exact arguments. A token obtained
  for one subscription must not be reused for another.

## Failure handling

- A delivery that failed with a retryable upstream status is a candidate for exactly one
  `retry_webhook_delivery` call for that delivery id.
- Two failures on the same delivery mean the receiver is misconfigured or down. Stop and report, with the
  receiver's status codes as evidence.
- If a write times out, read the current state before acting again. A create that landed after a timeout becomes
  a duplicate when retried blindly.
- If a webhook tool is missing from the catalog, treat it as a profile or authorization boundary and report it.
  Do not substitute a different tool that appears to do the same thing.

## Examples

Create with a native JSON object:

```json
{
  "url": "https://receiver.example.com/mermail",
  "event_types": ["email.received"],
  "is_active": true
}
```

Read deliveries with a bounded, structured query:

```json
{
  "webhook": "wh_01HZX8EXAMPLE",
  "query": {
    "sortColumn": "created_at",
    "sortDirection": "DESC"
  }
}
```

Do not pass `"query": "{\"sortColumn\":\"created_at\"}"`.
