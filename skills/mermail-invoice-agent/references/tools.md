# Invoice settlement agent tools

This workflow **uses** tools owned by other official skills. Do not add them to this skill in `tool-coverage.json`.

Pass structured arguments as **native JSON objects**. Never stringify `query` or `body`. Use the exact host identifier (`reply_to_email` or `Mermail:reply_to_email`). Prefer mailbox `public_id` as `mailboxId`.

## Intent map

| Intent | Real operation | Owner |
| --- | --- | --- |
| Discover invoices | `search_emails`, `list_emails` | `mermail-manage-inbox` |
| Read invoice context | `get_email`, `get_thread`, `download_attachment` | `mermail-manage-inbox` |
| Check PayBox wallet status | `get_paybox_connection` | `mermail-agent-wallet` |
| Check token balances | `paybox_get_portfolio` | `mermail-agent-wallet` |
| Execute / stage payment | `paybox_request_transfer` | `mermail-agent-wallet` |
| Inspect transaction status | `get_paybox_invocation` | `mermail-agent-wallet` |
| Send receipt to vendor | `reply_to_email` | `mermail-compose-email` |
| Draft owner escalation | `save_draft` | `mermail-compose-email` |
| Label & archive invoice | `create_custom_label`, `update_email` | `mermail-manage-inbox` |

## Tool execution details

### 1. `search_emails` & `get_thread`
- Use targeted search queries: `subject:"Invoice" OR subject:"Bill" OR "payment due"`.
- Fetch the full thread to verify whether an invoice has already been acknowledged or settled.

### 2. `get_paybox_connection` & `paybox_get_portfolio`
- Always verify that the PayBox connection is `ACTIVE` before initiating any transfer.
- Inspect `tokens` list in the portfolio response for the target currency (e.g. `USDC`) and check both `balance` and `available_balance`.

### 3. `paybox_request_transfer`
- Required payload fields:
  - `recipient`: Valid destination address (EVM 0x... or Solana base58).
  - `amount`: String or numeric quantity to transfer.
  - `token`: Token symbol or contract mint address.
  - `memo`: Optional reference string matching the invoice number.
- Response returns an invocation ID used to poll settlement status.

### 4. `reply_to_email`
- Requires:
  - `mailboxId`: The active Mermail mailbox public ID.
  - `emailId`: The ID of the email message being answered.
  - `body.text` or `body.html`: Standardized settlement receipt body.
