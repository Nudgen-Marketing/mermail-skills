# Invoice Settlement Workflow Details

## 1. Discovery
Search for unhandled invoice messages:
- Query: `subject:invoice OR subject:bounty OR label:invoice`
- Extract: `sender`, `message_id`, `thread_id`, `amount`, `currency`, `recipient_address`, `proof_url`.

## 2. Deliverable Verification
- Ensure proof URL matches expected GitHub repository, PR, or artifact.
- Validate test status, commit presence, or deliverable completeness.
- Ensure invoice amount does not exceed authorized budget limit.

## 3. PayBox Settlement
- Call `get_paybox_connection` to verify `ACTIVE` status.
- Call `get_agent_wallet_portfolio` to verify balance >= invoice amount.
- Execute `paybox_request_transfer(to=recipient_address, amount=amount, asset="USDC")`.

## 4. Cryptographic Receipt
- Dispatch confirmation email with transaction signature and settlement summary using `reply_to_email` or `send_email`.
