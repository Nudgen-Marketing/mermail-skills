# Invoice settlement agent templates

Use these structured email and report formats for vendor communications and owner escalations.

## 1. Vendor Payment Confirmation Receipt

Subject: `Re: {{original_subject}} - [PAID] Payment Confirmation: {{invoice_id}}`

```text
Hello {{vendor_name}},

This email confirms that your invoice {{invoice_id}} has been successfully settled on-chain via Mermail PayBox.

Settlement Summary:
- Invoice ID: {{invoice_id}}
- Amount Paid: {{amount}} {{token}}
- Recipient Address: {{recipient_address}}
- Settlement Network: {{network_name}}
- Transaction Hash: {{tx_hash}}
- Explorer Link: {{explorer_url}}/tx/{{tx_hash}}
- Timestamp: {{timestamp}} UTC

Please retain this receipt for your accounting records. Thank you for your partnership.

Best regards,
Automated Accounts Payable
{{organization_name}} via Mermail
```

## 2. Owner Approval Request (High-Value Invoices)

Subject: `[ACTION REQUIRED] Approval Needed: Invoice {{invoice_id}} from {{vendor_name}}`

```text
Dear Finance Team,

The autonomous settlement agent has ingested an inbound invoice that exceeds the autonomous payment threshold.

Invoice Details:
- Vendor: {{vendor_name}} ({{vendor_email}})
- Invoice ID: {{invoice_id}}
- Billed Amount: {{amount}} {{token}}
- Recipient Address: {{recipient_address}}
- Due Date: {{due_date}}
- Security Check: SPF/DKIM Passed | Attachment Clean

Current PayBox State:
- Token: {{token}}
- Available Balance: {{available_balance}} {{token}}
- Status: Sufficient funds available

To authorize broadcast of this transaction, reply with 'APPROVE' or review in Mermail Console.
```

## 3. Duplicate Invoice Notice

Subject: `Re: {{original_subject}} - Invoice {{invoice_id}} Already Settled`

```text
Hello {{vendor_name}},

Our records indicate that Invoice {{invoice_id}} has already been processed and settled.

Previous Settlement Record:
- Settled On: {{settled_timestamp}} UTC
- Amount Paid: {{amount}} {{token}}
- Transaction Hash: {{tx_hash}}
- Explorer Link: {{explorer_url}}/tx/{{tx_hash}}

No additional transfer has been initiated. If you believe this is an error, please reach out to our finance team directly.
```
