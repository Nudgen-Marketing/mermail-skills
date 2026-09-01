# Tools reference

This skill owns no tools. Every tool below is borrowed, and the owning skill's argument, approval, and retry contract applies unchanged.

## Borrowed tools and owners

| Tool | Owner | Used for |
| --- | --- | --- |
| `list_mailboxes` | `mermail-administer-workspace` | Resolve one reporting mailbox by `public_id` |
| `search_emails` | `mermail-manage-inbox` | Bounded receipt discovery for the fixed period |
| `list_emails` | `mermail-manage-inbox` | Paginated fallback when search is too narrow |
| `get_email` | `mermail-manage-inbox` | Read a selected receipt after it passes verification |
| `get_email_context` | `mermail-manage-inbox` | Read `sender_authentication.status` and `scan_status` |
| `save_draft` | `mermail-compose-email` | Prepare the P&L digest |
| `send_email` | `mermail-compose-email` | Deliver the digest after explicit approval |
| `schedule_email_send` | `mermail-compose-email` | Schedule a recurring digest |
| `get_paybox_connection` | `mermail-agent-wallet` | First PayBox action in every run that may transfer |
| `paybox_get_portfolio` | `mermail-agent-wallet` | Confirm holdings before proposing a surplus amount |
| `paybox_request_transfer` | `mermail-agent-wallet` | One approved surplus transfer |
| `paybox_get_request` | `mermail-agent-wallet` | Reconcile one known request; never a second transfer |

## Argument shapes

- Query filters are native JSON objects. A stringified JSON blob is rejected by the live schema.

  ```json
  { "folder": "inbox", "query": "invoice OR receipt OR payout" }
  ```

- `paybox_request_transfer` takes a token amount as `amount_decimal`, not a USD notional. Read the live schema before building the call; do not invent fields it does not expose.
- Host-qualified names such as `Mermail:list_emails` are the exact identifiers some hosts expose. Use what the host lists rather than stripping the prefix.

## Tools this skill must not call

- `get_api_credit_usage` and `get_email_usage` are plan and credit administration. They belong to `mermail-administer-workspace` even though they describe spend.
- `paybox_request_swap` and `paybox_pay_x402` are out of scope. Currency conversion and paid services route to `mermail-agent-wallet` and `mermail-x402-agent`.
- `delete_email`, `bulk_delete_emails`, and `empty_trash` are never part of reconciliation. Reconciliation is read-only over the inbox.

## Preflight helper

`scripts/check-treasury-scope.mjs` verifies that the connected session exposes the inflow, digest, and wallet tool groups, and prints which capability is unavailable so the run can degrade to read-only reconciliation instead of failing partway.

```bash
export MERMAIL_API_KEY
node skills/mermail-autonomous-treasury/scripts/check-treasury-scope.mjs
```

An omission of `paybox_*` from `tools/list` is not proof that PayBox is unavailable. The script says so explicitly, and the workflow still calls `get_paybox_connection` once before reporting any PayBox blocker.
