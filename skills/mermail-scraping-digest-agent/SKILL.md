---
name: mermail-scraping-digest-agent
description: Automatically scrape web data, summarize market/news metrics via Python, and deliver automated digests to Mermail Agent Inbox.
metadata:
  openclaw:
    requires:
      env:
        - MERMAIL_API_KEY
    primaryEnv: MERMAIL_API_KEY
    homepage: https://docs.mermail.app/ai/skills
    emoji: 📬
  contribution:
    version: 1.0.0
    author: HTaqiDev
    license: MIT
---

# Mermail Web Scraping & Digest Agent Skill

## Implementation status — blocked

The intended use case remains automated web-fed digest delivery. The shipped helper currently fetches and formats only three public crypto-price records; it does **not** implement a Mermail dispatcher, scheduler, general news scraping or AI summarization. Those capabilities require author implementation and exact current MCP/recipient/approval contracts before this PR can meet its claimed use case. Do not infer delivery, recurring execution, or authorization from formatted output. No email is sent by running the helper, and it exits nonzero when delivery is unavailable. Do not run demo sends to validate this PR.

This skill enables AI agents to automatically extract, summarize, and deliver live web data (crypto prices, market news, technical feeds) directly into a user's **Mermail Agent Inbox**.

Read [tools.md](references/tools.md) for the implemented capability boundary and [security.md](references/security.md) before interpreting fetched data or planning future delivery.

## Intended features (not all implemented)
- **Automated Web Scraping:** Uses Python (`requests`, `BeautifulSoup`) to extract real-time market data.
- **AI Digest Generation:** Structurally formats raw data into clean, actionable markdown summaries.
- **Mermail Integration:** Sends the generated digest directly via Mermail MCP / REST endpoint.

## Directory Structure
- `SKILL.md`: This specification and workflow documentation.
- `scripts/scrape_digest.py`: Existing public-price fetch/format helper; dispatch is explicitly blocked, not implemented.

## Prerequisites
- Python 3.10+ (the existing fetch/format helper uses only the standard library)
- A future dispatch implementation must use the authenticated selected workspace/mailbox and exact host-exposed schema; an inbox address or formatted digest alone is not an authenticated sending capability. Never paste a credential into chat or add it to this script.

## Workflow Example

1. **Trigger:** The AI agent receives a prompt like:
   *"Scrape current crypto market prices and send a digest to my Mermail inbox."*

2. **Execution:**
   Run the scraping script:
   ```bash
   python scripts/scrape_digest.py demo-agent@mermail.app
   ```
3. **Current result:** A structured `blocked` result with `delivered: false`. Missing/invalid market data is an error, not zero prices. The intended dispatch remains unimplemented; this output is not delivery evidence and must not be automatically retried as a send. A future actual delivery requires the compose owner's exact preview, independent approval and authoritative result. An uncertain send must be reconciled, not replayed.
