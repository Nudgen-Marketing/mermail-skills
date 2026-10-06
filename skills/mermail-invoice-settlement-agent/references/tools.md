# Mermail Invoice Settlement Agent — Tools Reference

## Mermail Inbox Tools

| Tool | Purpose in Invoice Settlement |
| :--- | :--- |
| `get_email_context` | Retrieves the active thread or highlighted email containing the invoice body and headers. |
| `search_messages` | Searches across inbox for historical invoices or matching vendor communication threads. |
| `reply_email` | Sends the settlement confirmation, transaction hash, and receipt directly to the sender. |
| `manage_mailbox_labels` | Tags processed messages with `status:settled`, `status:quarantine`, or `status:pending_review`. |

## Mermail PayBox & Wallet Tools

| Tool | Purpose in Invoice Settlement |
| :--- | :--- |
| `get_paybox_connection` | Confirms PayBox OAuth connection state and permissions before initiating financial workflows. |
| `paybox_get_balance` | Verifies available USDC liquidity on the target network before staging settlement. |
| `paybox_transfer` | Executes the authorized on-chain USDC transfer to the contractor's validated wallet address. |
| `paybox_get_buy_link` | Generates a direct top-up link if workspace balance is insufficient for the invoice total. |
