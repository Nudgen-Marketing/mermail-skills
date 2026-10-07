# Tools for `mermail-autonomous-service-onboarder`

## 1. Agent Inbox Tools
- **`list_mailboxes`**: Returns agent mailboxes.
- **`get_inbox_address`**: Generates a segregated sub-address (e.g. `agent+vendor@mermail.app`).
- **`list_messages`**: Polls for inbound verification messages.
- **`get_message`**: Retrieves full email body for sanitized regex parsing.

## 2. PayBox Agent Wallet Tools
- **`get_paybox_connection`**: Audits wallet readiness and balance on Base / Solana.
- **`paybox_pay_x402`**: Signs cryptographic payment proof for HTTP 402 challenges.
- **`paybox_redeem_proof`**: Settles payment with merchant and mints on-chain transaction hash.
