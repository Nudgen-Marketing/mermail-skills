# CI Failure-Mode Evidence & Troubleshooting

This document defines failure-mode recovery behaviors and dry-run fixtures for `mermail-agent-escrow-arbitration`.

## Documented Workflow Failure Modes

### 1. PayBox Connection Timeout / Unauthenticated Profile
* **Trigger**: Invoking `paybox_request_transfer` when the agent session is running under an API key or an unauthenticated profile.
* **Error Signature**: `paybox_connection_required` or `HTTP 401 Unauthorized`.
* **Expected Recovery**: The agent halts financial proposal execution immediately, does not retry in a loop, and prompts the workspace owner to establish a live PayBox connection via full-profile OAuth.

### 2. Ambiguous Deliverable or Checksum Collision
* **Trigger**: Provider delivers an unreadable attachment or fails to provide a verifiable checksum.
* **Expected Recovery**: The dispute countdown timer does not start until a valid deliverable payload with SHA-256 fingerprint is verified. A clarifying notification is appended to the deal thread.

### 3. Exceeded Spending Ceiling (> 500 USDC)
* **Trigger**: Transaction amount exceeds the 500 USDC autonomous threshold.
* **Expected Recovery**: The desk pauses before transfer execution, generates an approval request with deal context, and requires operator authorization token before release.

### 4. Malformed Email Query Payload
* **Trigger**: Escaped stringified JSON passed to `search_emails`.
* **Expected Recovery**: Query is structured as a native object (`{"query": "subject:ESC-YYYY-NNN"}`).
