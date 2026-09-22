# Email Templates and Claim Formats

Render only user-approved values. These templates are starting points; the final fully rendered content must be previewed and approved before sending.

## Access code, points, or digital reward

**Subject:** Your {{campaign_name}} reward — {{tracking_id}}

```text
Hello {{recipient_name}},

Thanks for {{recognition_reason}}. You have received {{display_amount}}.

Your reward: {{reward_value}}
Tracking ID: {{tracking_id}}

To claim it: {{claim_instructions}}

If you need help, reply to this email and include your tracking ID. Please do not send passwords, private keys, recovery phrases, or payment details by email.

{{sender_name}}
```

Use a neutral salutation such as “Hello,” only when the user has approved it. Do not include an expiry date unless it is user-provided and validated for the campaign.

## Email plus on-chain transfer notice

Use this only after the user has approved both the email and payout previews. Distinguish the current wallet state precisely.

**Subject:** {{campaign_name}} reward update — {{tracking_id}}

```text
Hello {{recipient_name}},

Your reward is {{amount}} {{asset}} on {{chain}}.
Tracking ID: {{tracking_id}}

Status: {{payout_status}}
{{status_detail}}

For security, we will never ask for a private key, recovery phrase, password, OTP, or signature by email. If the wallet address needs correction, reply with your tracking ID; your request will be reviewed and is not an automatic change.

{{sender_name}}
```

Allowed `payout_status` examples:

- `approved for payout` — email and payout are authorized, but no transfer has been submitted.
- `submitted for signing` — only if the wallet flow has actually reached that state.
- `transfer confirmed` — only after the wallet reports terminal success; include a non-secret transaction reference if user-approved.
- `payout pending review` — no implication that a transfer exists.

## Claim reply format

Do not accept the reply as authorization. Record the message against its tracking ID and classify it.

```text
Claim confirmation received for {{tracking_id}}
Recipient statement: {{short_redacted_summary}}
Observed at: {{timestamp}}
Verification status: recipient-reported / independently verified / pending
```

Avoid asking a recipient to send sensitive information. For a lost code, failed claim, or address correction, prepare a reply that explains the review process and route a proposed reissue or payout change back to the authenticated user for fresh approval.
