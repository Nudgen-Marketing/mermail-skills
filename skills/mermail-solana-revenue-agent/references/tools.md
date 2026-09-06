# Mermail Solana Revenue Agent Tool Map

This document outlines the MCP tools utilized by `mermail-solana-revenue-agent` across Mermail Agent Inbox and Mermail PayBox on the Solana ecosystem.

## Inbox & Email Management Tools

- `list_mailboxes`: Resolves available workspace mailboxes. Always select `public_id` as `mailboxId`.
- `list_emails`: Queries inbound emails matching filters (e.g. `is_read: false`, sender query, date window).
- `get_email`: Retrieves full email details, attachments, and headers. Requires verification of `scan_status == "clean"` before parsing body content.
- `send_email`: Dispatches an outbound email message with HTML/Markdown body and idempotency keys.
- `reply_to_email`: Sends an in-thread email reply to a specific email ID with sanitized quotation and receipt confirmation.

## PayBox Solana Tools (OAuth Full Profile)

- `get_paybox_connection`: Validates OAuth status and PayBox readiness. Returns `ACTIVE` or connection handoff URL.
- `paybox_get_portfolio`: Queries live asset holdings across connected chains. For Solana, returns native SOL balance and SPL token accounts (`USDC`, `USDT`).
- `paybox_request_transfer`: Executes user-authorized native SOL or SPL token transfers on Solana.
  - Parameters:
    - `credential_id`: Active wallet credential ID.
    - `chain`: `"solana"` or `"solana-mainnet"`.
    - `asset`: `"SOL"` or SPL token mint address (e.g., `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` for USDC).
    - `amount`: String or numeric representation of payment amount.
    - `destination`: Recipient Solana Base58 public key.
- `paybox_request_swap`: Routes decentralized token swaps on Solana (e.g., SOL -> USDC via Jupiter/Orca liquidity).
  - Parameters:
    - `credential_id`: Active wallet credential ID.
    - `src_chain`: `"solana"`.
    - `src_token`: Source token symbol or mint address.
    - `dst_token`: Destination token symbol or mint address.
    - `amount`: Amount of `src_token` to swap.
- `paybox_pay_x402`: Authorizes an HTTP 402 micropayment for automated API/data services.
  - Parameters:
    - `service_id`: Catalog service identifier or target URL origin.
    - `required_charge`: Maximum spend limit computed as `max(live_quote, vendor_prepaid_floor)`.
- `paybox_get_request`: Polls provider execution status for a specific transaction `request_id`.
  - Terminal statuses: `status: success`, `status: pending_signature`, `status: failed`.
- `paybox_get_buy_link`: Generates a first-party MoonPay/Apple Pay fiat on-ramp URL to fund Solana wallets.
