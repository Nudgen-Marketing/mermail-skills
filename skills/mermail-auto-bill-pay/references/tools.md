# Mermail Auto-Bill Pay — Tool & Field Reference

## MCP endpoint

```
POST https://console.mermail.app/mcp
Headers: x-api-key: <MERMAIL_API_KEY>, Accept: application/json, text/event-stream
Protocol: JSON-RPC 2.0 + tools/call { name, arguments }
```

## Tool map (API-key scope; wallet tools require full-profile OAuth)

| Step | Tool | Arguments |
|---|---|---|
| Discover mailbox | `list_mailboxes` | `{}` → use `public_id` |
| Scan inbox | `list_emails` | `{mailboxId, query:{folder:"inbox", limit}}` |
| Read full email | `get_email` | `{mailboxId, emailId}` |
| Confirm payment | `reply_to_email` | `{mailboxId, emailId, body:{to,from,subject,text}}`；外部收件人被拒时回退 `send_email`（同 payload） |
| Ensure folder | `create_folder` | `{mailboxId, body:{name}}`（重名报 `folder_name_taken`，可忽略） |
| Archive | `move_email` | `{mailboxId, emailId, body:{folderId:"processed"}}` |
| Wallet (OAuth only) | `paybox_*` (e.g. `get_paybox_connection`, `paybox_pay_x402`) | probe connection first; exact schema from `tools/list` |

## Field grammar (extraction patterns)

| Field | Pattern (case-insensitive) |
|---|---|
| Invoice number | `Invoice #?: ([A-Z0-9][A-Z0-9\-]{3,20})` |
| Amount + currency | `(USD[CCT]?|\$|USDC|USDG)? ([0-9,]+(\.[0-9]{2})?) (USDC|USDG|USDT|\$)?` |
| Due date | `Due (date)?:? (YYYY-MM-DD | MM/DD/YYYY)` |
| Pay-to | `Pay (to)?:? (0x[a-fA-F0-9]{20,80})` |
| Vendor | `(Vendor|Biller|From|Company|Merchant):? ([A-Za-z0-9 .&\-]{2,40})` |

## Spend policy defaults

- max amount per invoice: 500 USDC (configurable via `--max-amount`)
- duplicate: same invoice number OR same email id already in ledger
- denylist / allowlist: provided by user, never inferred from email content

## Output contract

Final status object:

```json
{
  "status": "approved_and_queued | requires_approval | duplicate | policy_rejected",
  "email_id": "...",
  "invoice": { "invoice_number": "...", "amount": 249.0, "currency": "USDC",
               "due_date": "2026-10-05", "pay_to": "0x...", "vendor": "..." },
  "policy_issues": []
}
```
