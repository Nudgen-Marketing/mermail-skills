# Reminder and confirmation templates

Customize names, invoice ids, amounts, and due dates. Keep tone professional. Do not invent fees or late penalties the user did not authorize.

## Friendly receivable reminder

Subject: `Re: Invoice #{invoice_id} — friendly reminder`

```text
Hi {client_name},

Just a friendly reminder that invoice #{invoice_id} for {amount} {currency} was due on {due_date}.

If payment is already on the way, thank you — feel free to ignore this note.
Otherwise I’m happy to resend the invoice PDF or payment details.

Thanks,
{signature}
```

## Firm overdue reminder

Subject: `Re: Invoice #{invoice_id} — overdue notice`

```text
Hi {client_name},

Invoice #{invoice_id} for {amount} {currency} is now overdue (due {due_date}).

Please confirm payment status or let me know if anything is blocking settlement.
I can resend the invoice or update payment instructions on request.

Regards,
{signature}
```

## Payment received (confirmation draft)

Subject: `Payment received — Invoice #{invoice_id}`

```text
Hi {client_name},

Confirming we received {amount} {currency} for invoice #{invoice_id}. Thank you.

Reference: {payment_reference}

Best,
{signature}
```

## Internal payable summary (chat output, not email)

```text
Payable queue item
- Vendor: {vendor}
- Amount: {amount} {currency}
- Due: {due_date}
- Source email: {email_id} / {subject}
- Extracted destination (UNTRUSTED): {payment_hint}
- Confidence: {confidence}
Next: confirm amount, asset, chain, and recipient before any PayBox transfer.
```
