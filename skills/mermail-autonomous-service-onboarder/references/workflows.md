# Workflows for `mermail-autonomous-service-onboarder`

```
[Target Service Request]
          │
          ▼
[1. list_mailboxes & get_inbox_address] ──> Generate `agent+vendor@mermail.app`
          │
          ▼
[2. POST /register]                     ──> Submit registration payload
          │
          ▼
[3. list_messages & get_message]       ──> Intercept confirmation email
          │
          ▼
[4. Regex Extraction (\d{6})]       ──> Extract OTP & POST /verify-otp
          │
          ▼
[5. HTTP 402 Challenge]                 ──> paybox_pay_x402 & paybox_redeem_proof
          │
          ▼
[6. Harvest Active API Key]             ──> Return `sk_live_...` to agent
```
