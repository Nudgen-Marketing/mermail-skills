# Harness Compatibility & Adapter Compliance

This document provides multi-surface harness compatibility evidence for `mermail-agent-escrow-arbitration`.

## Supported Agent Surfaces

| Surface | Protocol / Integration | Verification Status |
| :--- | :--- | :--- |
| **Claude Code** | Native MCP via `claude mcp add` | Compatible. Passes native tool invocation with query argument schemas. |
| **OpenAI Codex** | Manifest `agents/openai.yaml` pointing to `https://console.mermail.app/mcp` | Compatible. Explicit tool definitions conform to Codex schema. |
| **OpenClaw** | OpenClaw Plugin Manifest (`metadata.openclaw`) | Compatible. Verified with `primaryEnv: MERMAIL_API_KEY`. |
| **Cursor** | Remote MCP via `mcp.json` / OAuth | Compatible. Tools resolve under `mcpServers.mermail`. |
| **Hermes Agent** | Portable Agent Plugins v1 (`plugin.json` + `mcp.json`) | Compatible. |
| **Zed** | Context Server protocol via streamable-http | Compatible. |

## Surface Drift & Isolation Guarantees

1. **No Proprietary Tool Extensions**: Only official Mermail MCP tools (`list_emails`, `search_emails`, `get_email`, `send_mail`, `get_paybox_connection`, `paybox_request_transfer`) are referenced.
2. **Deterministic Argument Payloads**: All tool call arguments are passed as native JSON objects, avoiding stringified JSON parser mismatch across different LLM runners.
3. **Graceful Degradation**: If PayBox tools are unauthenticated, the skill instructs the operator to authenticate via full-profile OAuth before proposing financial disbursements.
