# Invoice settlement workflows

## 1. Invoice Ingestion & Verification Sequence

```text
[ Inbound Mailbox ] ──> list_emails / search_emails (filter "Invoice" / "Payment")
         │
         ▼
[ Bounded Read ] ──> get_email / download_attachment (parse vendor, amount, address)
         │
         ▼
[ Portfolio Check ] ──> get_agent_wallet_portfolio (verify sufficient balance)
         │
         ▼
[ Exact Preview ] ──> User Approval Prompt (recipient, token, amount, invoice ID)
         │
         ▼
[ Proposal Creation ] ──> create_agent_wallet_transfer_proposal / paybox_request_transfer
         │
         ▼
[ Settlement & Receipt ] ──> move_email / create_custom_label + reply_to_email (confirmation hash)
```

## 2. Decision Tree

1. **Discovery:** Call `list_mailboxes` to identify the active accounts payable or billing mailbox.
2. **Search:** Use `search_emails` or `list_emails` with bounded pagination to find new unread invoice submissions.
3. **Parse & Verify:**
   - Extract vendor identity, invoice number, due date, payment amount, and receiving token address.
   - Require `scan_status: clean` before parsing body or attachments.
   - If required fields are missing or ambiguous, call `save_draft` with a clarification request and prompt the user. Do not guess payment parameters.
4. **Balance Verification:**
   - Call `get_agent_wallet_portfolio` to ensure the wallet has sufficient funds including estimated transaction fees.
   - If insufficient, stop and report the balance deficit.
5. **Human Approval & Proposal:**
   - Present the full preview: Vendor, Invoice Number, Amount, Token, Recipient Public Key.
   - Upon user approval, call `create_agent_wallet_transfer_proposal` or `paybox_request_transfer`.
   - Provide the returned signing handoff URL or proposal ID to the user.
6. **Post-Settlement Confirmation:**
   - Once payment is confirmed, label the thread `Invoice/Settled` or move it to the Settled folder.
   - Draft or send a polite receipt reply to the vendor via `reply_to_email` including the settlement confirmation.
