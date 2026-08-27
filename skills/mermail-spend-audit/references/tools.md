# Tools used by mermail-spend-audit

All tools are Mermail MCP tools on `https://console.mermail.app/mcp`
(transport: Streamable HTTP, JSON-RPC over POST; auth: `x-api-key: $MERMAIL_API_KEY`).

## Inbox tools

| Tool | Used for | Notes |
| --- | --- | --- |
| `list_mailboxes` | Resolve the target mailbox when the workspace has several | First call when mailbox is ambiguous |
| `search_emails` | Find receipt/invoice/payment emails in the window | Multiple queries per sweep; see query list in workflows.md |
| `get_email` | Read one message and extract charge facts | Also used to fetch the full thread when a receipt references an order thread |
| `get_email_context` | Thread context when the receipt is part of an ongoing vendor conversation | Keeps provenance in the report |
| `save_draft` | Store `[spend-audit] YYYY-MM` report in the agent's own inbox | The only write this skill performs by default |

## PayBox probe

| Tool | Used for | Notes |
| --- | --- | --- |
| `get_paybox_connection` | One-time probe that PayBox is connected/ACTIVE before proof reconciliation | Per Mermail guidance, call it once even if `tools/list` omitted `paybox_*`; absence from a host list is not "not exposed" |

If the connection probe returns not-connected / unknown-tool, continue in
**inventory-only mode**: all proofs are marked `UNVERIFIED`, and the report says so.
Never fabricate verification results.

## Explicitly NOT used

- `send_email` — only with explicit user confirmation after showing the exact content.
- Any payment-initiation tool (`paybox_pay_*`, transfers, swaps) — out of scope; this skill
  audits spend, it does not create it.

## Receipt queries that work well

```
from:(noreply OR billing OR receipts) newer_than:30d
subject:("receipt" OR "invoice" OR "payment" OR "order confirmed")
"x402"                      # paid-service proof emails
"payment successful"
vendor names from previous audit reports
```

## Extraction targets per email

| Field | Where it usually lives |
| --- | --- |
| vendor | From domain or display name |
| amount + currency | Body table or highlighted line ("Total", "Amount charged") |
| date | Header `Date:` (fallback: body timestamp) |
| proof id | `x402` proof id, order id, or invoice number |
| plan/interval | Body text ("monthly", "usage-based") — drives recurring-drift flags |
