# Mermail Tool Reference: Bounty Settler

## Mailbox & Email Tools

### `mermail_list_mailboxes`
Lists all available agent mailboxes within the workspace.

### `mermail_list_emails`
Fetches email messages matching a search query or filter.
* Arguments:
  * `mailbox_id`: string (Public ID of mailbox)
  * `query`: string (e.g., `subject:"BOUNTY CLAIM"`)
  * `unread_only`: boolean

### `mermail_get_email`
Retrieves the full body, headers, and metadata of a specific message.
* Arguments:
  * `message_id`: string

### `mermail_send_email`
Sends an outgoing email or reply.
* Arguments:
  * `mailbox_id`: string
  * `to`: string
  * `subject`: string
  * `body`: string (Markdown supported)
  * `reply_to_id`: optional string

---

## Agent Wallet Tools

### `mermail_get_wallet_balance`
Retrieves available token balances (USDC, SOL, ETH).
* Arguments:
  * `network`: `"solana"` | `"ethereum"` | `"polygon"`

### `mermail_transfer_funds`
Executes an on-chain token transfer from the Agent Wallet.
* Arguments:
  * `network`: string
  * `recipient`: string (0x... or Solana Base58 address)
  * `amount`: number
  * `token`: string (`"USDC"`)
  * `memo`: string
* Returns:
  * `tx_hash`: string (Transaction signature / hash)
  * `status`: `"CONFIRMED"`
