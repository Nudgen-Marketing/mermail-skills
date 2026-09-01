# Security & Threat Invariants

1. **Replay Protection**: Identical signatures or payloads older than 300 seconds are rejected immediately.
2. **Cap Bounds**: Hard limits of 100 USDC per single transaction and 500 USDC daily cumulative spend.
3. **Anti-SSRF**: Public network mode rejects private RFC 1918 IPs and AWS/GCP cloud metadata.
4. **Prototype Pollution**: Canonicalization strips `__proto__`, `constructor`, and `prototype` keys.
