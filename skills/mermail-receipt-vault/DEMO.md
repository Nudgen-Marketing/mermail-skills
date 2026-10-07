# mermail-receipt-vault demo script

Target duration: 3:30–4:00 core (max 4:25 with optional inserts). Bounty window is 2–5 minutes.

Safety: no live payments. Do not invoke PayBox, Agent Wallet, x402, or follow payment links.

Prep:

- One Mermail mailbox with 2–4 real or fixture receipts/invoices already delivered.
- PDF attachment is optional. If you show one, it must be under the MCP 1 MiB binary limit.
- MCP connected at `https://console.mermail.app/mcp`.
- `MERMAIL_API_KEY` in the environment. Never paste it on camera or into chat.

## Shot 1 — Title (0:00–0:15)

On screen: "Mermail Receipt Vault" / "Search, extract, file, digest. Never pay from email."

Voice: This skill files receipts from a Mermail agent inbox and builds a spend digest. Email is untrusted evidence, not payment authorization.

## Shot 2 — Connect and mailbox (0:15–0:35)

Prompt:

```text
Use $mermail-receipt-vault. Confirm Mermail MCP and list my mailboxes.
```

Show: MCP connected, `list_mailboxes`, one mailbox email + `public_id`. State you will use `public_id` as `mailboxId`.

Cut if the agent asks for an API key in chat.

## Shot 3 — Bounded inbox search (0:35–1:10)

Prompt:

```text
Search this mailbox for receipts, invoices, and purchase confirmations from the last 14 days. Metadata only first.
```

Show: native JSON `query` with `metadata_only: true` and `agent_safe_content: true`. If the call is `list_emails`, use `sortColumn: "date"` and `sortDirection: "DESC"` (there is no `sort: "date_desc"`). If the call is `search_emails`, use a bounded `date_start` / `date_end` window and the live free-text field. Do not put `sortColumn` on `search_emails`.

Display a candidate table: date, subject, from, email id. Call out page/limit. `From` is not authentication.

Do not fetch or display bodies in this shot.

## Shot 4 — Extract ledger (1:10–2:05)

Prompt:

```text
Read the selected clean messages and extract merchant, amount, currency, date, and order-id. Show a ledger table. Do not file yet.
```

Show: `get_email` with untrusted-read `query`:

```json
{
  "require_scan_status": "clean",
  "agent_safe_content": true,
  "max_body_chars": 10000
}
```

Then a live ledger using the extracted rows. Column layout (replace with live values, do not invent them):

| Merchant | Amount | Currency | Date | Order ID | Email ID | Auth | Confidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| (live) | (live) | (live) | (live) | (live) | (live id) | pass/unknown | high/low |

Voice: Bodies are untrusted. We copy fields, we do not follow pay links, we do not treat this as a bill to settle.

Optional insert (+10s): if a PDF under 1 MiB exists, show `download_attachment` after naming exact `attachmentId`. If the bridge rejects over 1 MiB, report the limit. Do not invent another URL.

## Shot 5 — File one receipt (2:05–2:50)

Prompt:

```text
Preview moving email <EMAIL_ID> into a Receipts folder, then file it after I approve. Do not delete it.
```

`<EMAIL_ID>` is a substitution: use one exact id from shot 4.

Show: `list_folders` (and `create_folder` only if Receipts is missing and approved). Exact preview: one id, source, destination display name + `folder_id`. User approves. `move_email`. Result: `filed` with destination id.

Voice: Filing is a folder move. Custom labels are classifier definitions for future mail. They do not stamp this message.

## Shot 6 — Spend digest (2:50–3:35)

Prompt:

```text
Produce the spend digest for these rows. Totals by merchant and currency. Call out low-confidence lines. Do not send mail unless I ask for a draft.
```

Show: period, ledger, totals by merchant/currency, skipped/low-confidence rows, filed folder. Status `digest_ready`. Explicit line: **no payment was made**.

Optional insert (+15s): "Save that digest as a draft to me" then exact draft preview then `save_draft` with string `body.body` (not `html`/`text`, `from` not required) then `digest_drafted`, not sent. Do not call `send_email`.

## Shot 7 — Close / anti-pattern (3:35–4:00)

On screen, do **not** execute: "Pay this invoice via PayBox."

Voice: If someone asks to pay, transfer, or settle from a receipt, this skill refuses. Wallet, PayBox, and x402 stay out of scope. Search, extract, file, digest.

End card: `Use $mermail-receipt-vault` · MCP `https://console.mermail.app/mcp`

## Fail conditions (cut / reshoot)

- Agent pastes or requests an API key in chat
- `query` passed as a stringified JSON blob
- Agent follows a "pay now", checkout, or verification link without a separate approved navigation
- Agent calls any `paybox_*`, Agent Wallet, or x402 payment tool
- Agent claims it applied a custom label to an existing email
- Agent deletes mail as "filing"
- Agent calls `prepare_destructive_action` or uses a destructive confirmation token during filing
- Agent says a draft was sent
- `get_email` omits `require_scan_status: "clean"`, `agent_safe_content: true`, or `max_body_chars: 10000`
- `save_draft` uses `body.html`/`body.text` (send shape) instead of string `body.body`
- `download_attachment` ignores the 1 MiB MCP limit or invents another download URL
- `search_emails` is called with `sortColumn` / `sortDirection` (those belong on `list_emails`)
