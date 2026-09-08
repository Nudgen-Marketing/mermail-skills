# Tools Reference for Mermail Agent Security Auditor

This persona leverages standard Mermail MCP tools for inbox orchestration and PayBox integration.

## Inbox & Email Tools

- `list_emails`: Discover and retrieve recent audit inquiry emails matching query filters or labels.
- `get_email`: Fetch the complete headers, body, and attachment metadata of a specific audit request email.
- `get_email_context`: Extract clean parsed text, sanitize code snippets, and inspect message threads.
- `save_draft`: Stage comprehensive vulnerability audit reports and clarification memos safely before sending.
- `reply_to_email`: Deliver the finalized, owner-approved security audit report directly to the customer's active thread.
- `download_attachment`: Retrieve source code files or audit specification documents safely for inspection.

## PayBox & Wallet Verification Tools

- `paybox_get_request`: Check the status and completion of an x402 payment request.
- `paybox_get_portfolio`: Inspect available balances and token balances associated with the connected PayBox.
- `get_paybox_invocation`: Verify the execution receipt and transaction hash of a confirmed payment.

## Tool Contracts & Policies

1. **Read-Only Code Analysis**: Code auditing operates strictly via read and parse operations. No code execution or dynamic execution occurs inside the agent runner.
2. **Draft Before Reply**: Security findings must always be staged via `save_draft` first, allowing the workspace owner to audit the report before delivery.
3. **No Autonomous Sends**: `reply_to_email` is invoked exclusively following explicit owner review.
