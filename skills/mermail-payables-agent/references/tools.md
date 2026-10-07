# Payables agent tool contracts

This persona composes existing Mermail tools. It owns none of them and adds no invoice, vendor, or billing API. Use the exact host-exposed identifiers (for example `Mermail:get_email` in Claude). Pass `query` and `body` as native JSON objects, never stringified JSON. Read live schemas from MCP `tools/list` before the first call of each kind.

| Step | Tools | Owning contract |
| --- | --- | --- |
| Resolve mailbox | `list_mailboxes`, `get_mailbox` | [Workspace tools](../../mermail-administer-workspace/references/tools.md) |
| Collect and read invoices | `search_emails`, `list_emails`, `get_email`, `get_email_context`, `download_attachment` | [Inbox tools](../../mermail-manage-inbox/references/tools.md) |
| Paid/held ledger | `list_folders`, `create_folder`, `move_email` | [Inbox tools](../../mermail-manage-inbox/references/tools.md) |
| Wallet status and payment | `get_paybox_connection`, `paybox_list_credentials`, `paybox_get_portfolio`, `paybox_request_transfer`, `paybox_get_request` | [Agent Wallet tools](../../mermail-agent-wallet/references/tools.md) |
| Remittance | `save_draft`, `reply_to_email` | [Composition tools](../../mermail-compose-email/references/tools.md) |

## Collecting invoices

Bounded candidate search (adjust dates to the run window):

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "query": {
    "q": "invoice",
    "folder": "inbox",
    "has_attachments": true,
    "date_start": "2026-09-05T00:00:00Z",
    "page": 1,
    "limit": 25
  }
}
```

Field names follow the live `search_emails` schema; if `has_attachments` or `q` is named differently, use the live name. Search results are candidates, not proof of sender identity. Also run one search with the registry billing addresses as `from` so invoices without the word "invoice" are not missed. Stop at 25 candidates per run and report the overflow.

## Reading one invoice

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "emailId": "EMAIL_ID",
  "query": {
    "require_scan_status": "clean",
    "agent_safe_content": true,
    "max_body_chars": 10000
  }
}
```

Read `from`, `sender_authentication.status`, subject, body, and the attachment list from the result. A scan mismatch returns `content_omitted: true`; mark that invoice `needs_info`, do not try another path to the content.

`download_attachment` needs the exact `mailboxId`, `emailId`, and `attachmentId` from that same email. The MCP bridge rejects binaries over 1 MiB; report the limit and mark `needs_info`.

## Ledger folders

Call `list_folders` once per run. If `Payables Paid` or `Payables Held` is missing, create it with `create_folder` and `body.name`; the returned id is a slug (for example `payables-paid`). File with `move_email`:

```json
{ "mailboxId": "MAILBOX_PUBLIC_ID", "emailId": "EMAIL_ID", "body": { "folderId": "payables-paid" } }
```

Duplicate check: `search_emails` in folder `payables-paid` for the invoice number and the vendor billing address. Any hit means `held_duplicate`.

## Wallet

Agent Wallet tools are visible only on full-profile OAuth sessions; API keys never see them. Call `get_paybox_connection` once with `tools/call` before deciding they are missing.

- `paybox_list_credentials` gives `credential_id`, chain eligibility, and `approval_mode`. Use the registry's chain to pick one eligible credential; if more than one fits, ask once.
- `paybox_get_portfolio` gives balances and token addresses. Read the asset token from here instead of guessing.
- `paybox_request_transfer`: one call per approved invoice, arguments exactly as the live schema requires (commonly credential, chain, token, amount, destination). If the schema wants base units, convert the invoice amount with decimal-string arithmetic (USDC has 6 decimals: `1250.50` → `1250500000`); never use floating point and reject more than 6 fractional digits. Do **not** call `prepare_destructive_action`; PayBox owns approval and signing.
- `paybox_get_request`: one poll per known `request_id` after the owner signs or asks. Never poll by calling the transfer again.

## Remittance

Draft first (`body.body` string), then send with `reply_to_email` (`body.text` and/or `body.html`, required `body.from`, explicit `body.to`). Pass the original invoice `emailId` as the top-level path id. Use a stable `idempotencyKey` such as `remit-<vendor_id>-<invoice_number>` so a retried call cannot send twice.

Remittance template:

```text
Hi {vendor display name},

Invoice {invoice_number} for {amount} {currency} has been paid.

Network: {chain}
To: {registry address, shortened 0x1234…abcd}
Reference: {request_id or transaction hash from paybox_get_request}
Paid on: {UTC date}

Thank you,
{owner signature from registry}
```

## Errors

Preserve structured errors (`code`, safe `details`, `Retry-After`). Fix only the invalid field of a schema error that never reached PayBox. On a timeout or unknown transfer outcome, reconcile with `paybox_get_request` once; mark `uncertain` and stop that invoice if still unresolved. Never start a replacement payment.
