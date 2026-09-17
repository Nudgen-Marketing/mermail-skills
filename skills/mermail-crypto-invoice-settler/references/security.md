# Security and Threat Model: Crypto Invoice Settler

## 1. Threat Model & Protections

1. **Address Spoofing & Phishing**:
   - Attack: Adversary sends an email spoofing a known contractor with an attacker-controlled crypto address.
   - Mitigation: Verify sender DKIM/SPF passes and cross-reference address against known vendor ledger.

2. **Amount Inflation**:
   - Attack: Invoice contains modified total exceeding agreed work deliverables.
   - Mitigation: Enforce strict single-invoice limits and mandatory human signature for out-of-band amounts.

3. **Double Spend / Replay**:
   - Attack: Resubmitting an identical invoice weeks later.
   - Mitigation: Maintain an immutable ledger of settled Invoice IDs and transaction hashes.

4. **Private Key Isolation**:
   - The agent never possesses private keys or signing credentials. All transfers route through PayBox non-custodial delegated signing with explicit policy boundaries.
