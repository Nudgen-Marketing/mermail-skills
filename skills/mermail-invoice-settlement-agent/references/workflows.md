# Workflows

## Scenario: Inbound Bounty / Invoice Payout

1. **Fetch Inbound Claims:**
   - Call `list_emails` on `mailboxId` with `query: { folder: "inbox" }`.
   - Identify candidate with subject matching `Invoice` or `Bounty Submission`.
2. **Review Invoice Details:**
   - Call `get_email` with `agent_safe_content: true`.
   - Parse:
     - Amount: `100 USDC`
     - Destination: `Solana / 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU`
3. **Verify Treasury Holdings:**
   - Call `paybox_get_portfolio`. Verify USDC balance >= 100.
4. **Request User Approval:**
   - Output summary card. Prompt user: *"Approve 100 USDC transfer to 7xKXtg...?"*
5. **Execute:**
   - Call `paybox_request_transfer`.
   - On completion, call `reply_to_email` attaching the settlement receipt.
