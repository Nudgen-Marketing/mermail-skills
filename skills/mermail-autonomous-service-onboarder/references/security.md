# Security Policies for `mermail-autonomous-service-onboarder`

1. **Prompt Injection Defense**: Inbound email HTML/text is treated as untrusted data. Only regex-matched patterns (`\b\d{6}\b`) are extracted.
2. **Spending Ceilings**: Pre-authorized default spending ceiling ($5.00 USDC). Transactions exceeding this threshold require explicit human confirmation.
3. **Sub-Address Isolation**: Every vendor receives a unique sub-address to prevent cross-service tracking and credential reuse.
