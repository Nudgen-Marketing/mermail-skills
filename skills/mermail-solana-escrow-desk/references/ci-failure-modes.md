# CI Failure Modes & Troubleshooting

Operational failure modes, recovery paths, and dry-run fixtures for automated accounts payable and escrow settlement.

## Common CI Failure Scenarios

### 1. Missing Authentication Token (`AUTH_UNAVAILABLE`)
- **Symptom:** API calls return HTTP 401 Unauthorized or `MERMAIL_API_KEY environment variable missing`.
- **Root Cause:** Running in an unprivileged or PR dry-run environment where secret injection is restricted.
- **Remediation:** Ensure `MERMAIL_API_KEY` is registered in GitHub Secrets and exposed to the step. In mock test suites, inject the stubbed transport layer.

### 2. PayBox Reauthorization Required (`PAYBOX_REAUTH_NEEDED`)
- **Symptom:** `get_paybox_connection` reports status `expired` or `needs_refresh`.
- **Root Cause:** OAuth token lease expired without automated background refresh.
- **Remediation:** Agent pauses automated financial execution, creates an internal review task, and generates an interactive OAuth login link for the user. Never retry transfer requests during auth-expired states.

### 3. Insufficient Portfolio Liquidity (`INSUFFICIENT_FUNDS`)
- **Symptom:** `paybox_get_portfolio` reveals USDC balance less than the requested invoice amount.
- **Root Cause:** Scheduled treasury sweeps or unexpected multi-invoice volume.
- **Remediation:** The agent flags the invoice with `status: deferred_funding`, drafts an alert email to the treasury manager, and exits without executing partial transfers.

### 4. Idempotency Conflict on Retry (`DUPLICATE_KEY`)
- **Symptom:** `paybox_request_transfer` returns HTTP 409 Conflict.
- **Root Cause:** A previous attempt was submitted over a degraded connection before network confirmation returned.
- **Remediation:** Immediately query `paybox_get_request` with the existing idempotency key. If terminal state is `settled`, proceed to send the receipt; do not generate a new idempotency key or re-transfer funds.

### 5. Invalid Recipient Base58 (`MALFORMED_ADDRESS`)
- **Symptom:** Address validation fails the 32–44 character Base58 regular expression check.
- **Root Cause:** Typo, email formatting artifact, or malicious spoofed string in the invoice body.
- **Remediation:** Hard halt. Draft a clarification inquiry back to the sender; never attempt automated address normalization or guess missing characters.
