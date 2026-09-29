# Tool and Capability Contract

This skill intentionally does not hard-code a fictional GitHub MCP tool.

## Mermail

Use the current connected Mermail MCP catalog for inbox and email operations.

The official Mermail skills repository currently separates:

- inbox management
- email composition/delivery
- Agent Wallet
- other domain workflows

Use the exact tool names and argument schemas exposed by the active MCP session.

For inbox work, prefer the repository's current inbox-management operations rather than inventing a mailbox API.

For outbound confirmation email, follow the Mermail compose/send workflow and its approval rules.

## GitHub

GitHub verification is an external dependency.

Preferred order:

1. Use a connected GitHub integration if the host exposes one.
2. Otherwise use an explicitly configured GitHub REST API client/tool.
3. If neither is available, report `verification_unavailable`.

The logical operation required is equivalent to:

```http
GET /repos/{owner}/{repo}/pulls/{pull_number}
```

The implementation must verify the authoritative merge state and must not infer it from email content.

Expected evidence:

```json
{
  "number": 15,
  "state": "closed",
  "merged": true
}
```

Do not assume the exact response shape of a host-specific connector.

## Agent Wallet / PayBox

The current Mermail skills repository documents:

```text
paybox_request_transfer
```

for transfers.

The current repository also states that Agent Wallet / PayBox requires full-profile MCP OAuth with `mcp:tools`. It is not available through API-key-only or agent-inbox-only profiles.

Before calling the transfer operation:

1. Confirm that the current MCP session exposes the PayBox operation.
2. Confirm that the user has approved the exact payment.
3. Preserve the approved recipient, amount, asset, and network.
4. Pass arguments according to the live tool schema.
5. Treat only the authoritative returned status/identifier as payment evidence.

Do not guess the argument names if the live tool schema differs.

## Tool Discovery Rule

If a tool referenced by this skill is not present:

- do not fabricate it,
- do not substitute an unrelated tool,
- do not claim the operation succeeded.

Instead return a capability-specific failure and explain what integration is missing.
