# Mermail Invoice Settlement Workflows

## 1. Invoice Discovery and Ingestion

1. Identify active mailboxes using `list_mailboxes` and select target mailbox by `public_id`.
2. Search for billing threads using `search_emails` with parameters:
   ```json
   {
     "query": {
       "term": "invoice OR billing OR receipt OR statement",
       "sortColumn": "date",
       "sortDirection": "DESC"
     }
   }
   ```
3. Retrieve message content using `get_email` with `agent_safe_content: true`.
4. If an invoice PDF attachment exists, retrieve it via `download_attachment`.

## 2. Line Item & Billing Verification

1. Extract structured invoice entities:
   - Vendor entity name & support contact
   - Invoice number / Billing reference
   - Due date and issue date
   - Total amount due, currency/asset (e.g. USDC, SOL)
   - Stated recipient payment address (Solana, EVM, etc.)
2. Check email sender authentication headers (SPF, DKIM, DMARC) to verify domain legitimacy.
3. Cross-reference vendor address against workspace approved vendor registry.

## 3. Financial Settlement Formulation

1. Call `get_agent_wallet` and `get_paybox_connection` to inspect available liquidity.
2. If wallet balance is lower than total due, generate a funding deep-link via `paybox_get_buy_link`.
3. If balance is sufficient, formulate a settlement transaction:
   - Construct `paybox_request_transfer` payload specifying exact amount, token, and recipient address.
4. Present a clear settlement preview to the user and request approval.

## 4. Execution, Signing & Receipt Confirmation

1. Upon user approval, dispatch `paybox_request_transfer` or `create_agent_wallet_transfer_proposal`.
2. When the response returns `pending_signature`, deliver the returned `signing_handoff.console_url` so the user can securely sign the transaction in Mermail Console.
3. Poll `paybox_get_request` with the transaction `request_id` to confirm blockchain finality.
4. Compose and send a payment confirmation reply via `reply_to_email` citing the transaction signature.
5. Move the email thread to the `Accounting/Settled` folder via `move_email`.
