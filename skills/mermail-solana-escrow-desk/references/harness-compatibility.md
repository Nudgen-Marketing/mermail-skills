# Cross-Harness Compatibility Matrix

Compatibility and integration evidence for the Mermail Solana Escrow Desk across autonomous AI agent environments.

## Supported Harnesses & Client Surfaces

| Client / Harness | Protocol / Transport | Auth Mechanism | Sandbox Constraints | Supported Operations |
| :--- | :--- | :--- | :--- | :--- |
| **Claude Code** | Streamable HTTP MCP | Native OAuth / User Scope | Read-only terminal fallback; user prompt for external transfers | Full inbox triage, PayBox balance inspection, draft composition, authorized USDC transfer |
| **OpenAI Codex** | Remote MCP | OAuth Bearer / `.codex-plugin/mcp.json` | Network sandbox with explicit allowlist | Batch invoice parsing, policy grant evaluation, idempotent settlement submission |
| **Cursor / Zed** | STDIO & Streamable HTTP | MCP OAuth & `MERMAIL_API_KEY` header | Workspace-scoped environment | Interactive invoice triage, one-click transfer approval preview, receipt dispatch |
| **OpenClaw / Hermes** | Native ClawHub Plugin | Primary `MERMAIL_API_KEY` | Headless autonomous daemon | 24/7 background AP inbox polling, budget fence enforcement, automatic transaction reconciliation |

## Protocol & Schema Compliance

1. **Tool Invocation Parity:**
   All PayBox operations (`paybox_request_transfer`, `paybox_get_portfolio`, `paybox_get_request`) and Mermail mailbox operations (`list_emails`, `get_email`, `send_email`, `save_draft`) strictly comply with standard JSON Schema draft-07. No vendor-specific extensions or non-serializable types are used.

2. **OAuth vs API Key Fallback Rules:**
   - Mailbox triage and draft operations succeed with `MERMAIL_API_KEY` across all headless runners.
   - Financial execution (`paybox_request_transfer`) enforces user-delegated OAuth permissions. If executing in a headless daemon without interactive OAuth session, the desk automatically shifts into `save_draft` preview mode requiring explicit user signature.

3. **Rate Limits & Backoff Handling:**
   - Adheres to standard Mermail API rate limits (120 req/min for mailbox ops, 30 req/min for PayBox portfolio queries).
   - Implements exponential jittered backoff on HTTP 429 and 503 responses.
