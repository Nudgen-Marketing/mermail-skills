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

This skill enables AI agents to automatically extract, summarize, and deliver live web data (crypto prices, market news, technical feeds) directly into a user's **Mermail Agent Inbox**.

## Features
- **Automated Web Scraping:** Uses Python (`requests`, `BeautifulSoup`) to extract real-time market data.
- **AI Digest Generation:** Structurally formats raw data into clean, actionable markdown summaries.
- **Mermail Integration:** Sends the generated digest directly via Mermail MCP / REST endpoint.

## Directory Structure
- `SKILL.md`: This specification and workflow documentation.
- `scripts/scrape_digest.py`: Executable Python script for scraping and dispatching Mermail digests.

## Prerequisites
- Python 3.10+
- `requests` and `beautifulsoup4`
- `MERMAIL_API_KEY` or `MERMAIL_AGENT_INBOX_ADDRESS`

## Workflow Example

1. **Trigger:** The AI agent receives a prompt like:
   *"Scrape current crypto market prices and send a digest to my Mermail inbox."*

2. **Execution:**
   Run the scraping script:
   bash
   python scripts/scrape_digest.py demo-agent@mermail.app
   3. **Result:**
   The script fetches live data, formats it into a structured digest, and dispatches it via Mermail API.
