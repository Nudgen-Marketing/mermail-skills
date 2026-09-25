# Tools used by mermail-invoice-guard

This persona owns no tools. It composes tools owned by focused skills. All names
below must exist on the hosted Mermail MCP server and are already declared in
`tool-coverage.json` under their owning skill. Do not add them to this skill's
ownership. Pass every MCP `query` value as a native JSON object, never a
stringified JSON string.

## Read the request (owned by mermail-manage-inbox)

- `list_emails` — list candidate payment-request emails in the target mailbox.
- `search_emails` — find prior emails from the same payee to build history.
- `get_email` — read one email in full.
- `get_email_context` — read the surrounding context for the email.
- `get_thread` — read the full conversation the request belongs to.
- `download_attachment` — retrieve an invoice PDF or file for extraction.

## Check the wallet (owned by mermail-agent-wallet, read-only subset)

- `get_agent_wallet` — confirm the wallet exists and its scope.
- `get_agent_wallet_portfolio` — confirm the asset and balance cover the amount.
- `paybox_get_contract` — resolve on-chain contract details when relevant.

## Propose only, never pay (owned by mermail-agent-wallet)

- `create_agent_wallet_transfer_proposal` — create a proposal with an idempotency
  key. This is the only write this skill initiates, and it produces a
  `held_for_approval` artifact, not a payment.

## Human-gated handoff (owned by mermail-agent-wallet, never called by this skill)

The following are wallet-destructive and stay behind a separate, explicit human
action inside `mermail-agent-wallet`. This skill routes the human's decision to
them but never calls them itself:

- `submit_agent_wallet_transfer`
- `reject_agent_wallet_transfer_proposal`
- `paybox_request_transfer`, `paybox_request_swap`, `paybox_pay_x402`

## Optional reply, draft only (owned by mermail-compose-email)

- `save_draft` — draft a confirmation or dispute reply. Never auto-send.
- `reply_to_email` — used only after a fresh, explicit human approval to send.
