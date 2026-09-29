# BEC Threat Model

## Attack Surface
- **Email Spoofing**: Vendor impersonation with fake invoices
- **Social Engineering**: 'Payment details changed' in invoice body
- **Register Tampering**: Malicious register entries

## Mitigations
- **Zero-Trust Processing**: Email content is untrusted evidence
- **Register Authority**: Only `expected-bill` entries trigger payments
- **Structural Parsing**: Reject invoices missing critical fields
- **Approval Gate**: Owner confirmation required for all payments

## Rejected Scenarios
1. Payment initiated from email content alone
2. Register updates via email
