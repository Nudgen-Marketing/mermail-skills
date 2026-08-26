---
name: mermail-legal-hold
description: Place, manage, and release litigation or regulatory holds on agent mailbox threads with wallet-signed chain-of-custody attestations. Use when a compliance event (litigation, audit, GDPR/DSAR request, SOX inquiry, or internal investigation) requires preserving mailbox evidence in place and producing a verifiable custody log.
metadata:
  openclaw:
    requires:
      env:
        - MERMAIL_API_KEY
    primaryEnv: MERMAIL_API_KEY
    homepage: https://docs.mermail.app/ai/skills
    emoji: "⚖️"
---

# Mermail Legal Hold

## Overview

Use this skill when a compliance or legal event requires freezing mailbox evidence in place and maintaining a verifiable chain of custody. The skill places holds, prevents deletion or modification of held threads, snapshots message metadata, and optionally signs custody attestations via Agent Wallet — producing an auditable trail that satisfies common e-discovery, GDPR data-preservation, and SOX record-retention requirements.

Read [tools.md](references/tools.md) for exact MCP tool operations. Read [security.md](references/security.md) for handling sensitive legal content.

## Preferred Deliverables

- A **hold placement summary** listing the matter ID, search predicate used, threads matched, and labels applied.
- A **custody manifest** — a JSON document recording every held message's `message_id`, `subject`, `from`, `to`, `date`, `thread_id`, and `scan_status` at the moment of hold.
- An optional **wallet-signed attestation** — a compact JSON payload signed via Agent Wallet proving the manifest existed at a specific timestamp (on-chain or off-chain, per operator policy).
- A **hold release report** confirming all hold labels removed, export completed, and attestation verified.

## Workflow

### Phase 1 — Hold Placement

1. Confirm the `mermail` MCP connection. Use the full-catalog endpoint (`https://console.mermail.app/mcp`) — legal hold requires label management, email updates, and optionally PayBox tools that the agent-inbox profile does not expose.
2. Resolve the credential-bound workspace with `list_workspaces({})`. Never cross workspace boundaries.
3. Identify the target mailbox with `list_mailboxes({})`. Confirm `can_receive: true` and `receiving_status: ready`. Record the `public_id` as `mailboxId` and the `email` for the custody log header.
4. Accept the hold parameters from the operator:
   - `matter_id` — a unique identifier for the legal matter (e.g. `CASE-2026-0042`).
   - `search_predicate` — one or more of: sender domain, recipient, subject keywords, date range. At least one field is required.
   - `hold_scope` — `threads` (default, freezes entire conversations) or `messages` (individual messages only).
   - `sign_attestation` — `true` (use Agent Wallet) or `false` (local-only manifest). Default `false`.
5. Create a hold label using `create_custom_label`:
   ```json
   {
     "name": "LEGAL-HOLD::CASE-2026-0042",
     "color": "#DC2626"
   }
   ```
   The `LEGAL-HOLD::` prefix makes holds discoverable and prevents collision with user labels.
6. Search for matching messages with `search_emails`:
   ```json
   {
     "mailboxId": "MAILBOX_PUBLIC_ID",
     "query": {
       "from": "counterparty.example.com",
       "date_start": "2025-01-01T00:00:00.000Z",
       "date_end": "2026-08-01T00:00:00.000Z",
       "metadata_only": true,
       "agent_safe_content": true,
       "limit": 50,
       "page": 1
     }
   }
   ```
   Paginate through all results. Record every matching `message_id`.
7. For each matched message, apply the hold label using `update_email`:
   ```json
   {
     "emailId": "MESSAGE_ID",
     "body": {
       "labelIds": ["HOLD_LABEL_ID"]
     }
   }
   ```
   If `hold_scope` is `threads`, expand each message to its thread with `get_thread` and apply the label to every message in the thread.
8. Build the **custody manifest**:
   ```json
   {
     "schema_version": "1.0.0",
     "matter_id": "CASE-2026-0042",
     "hold_placed_at": "2026-08-27T12:00:00Z",
     "mailbox_email": "legal-inbox@example.mermail.app",
     "mailbox_id": "MAILBOX_PUBLIC_ID",
     "search_predicate": { "from": "counterparty.example.com", "date_range": ["2025-01-01", "2026-08-01"] },
     "hold_label_id": "HOLD_LABEL_ID",
     "held_messages": [
       {
         "message_id": "msg_abc123",
         "thread_id": "thr_xyz789",
         "from": "alice@counterparty.example.com",
         "to": ["legal-inbox@example.mermail.app"],
         "subject": "Settlement discussion",
         "date": "2025-06-15T09:30:00Z",
         "scan_status": "clean"
       }
     ],
     "total_held": 47,
     "manifest_hash": "sha256:..."
   }
   ```
   Compute a SHA-256 hash of the serialized manifest (sorted keys, no whitespace) and embed it.

### Phase 2 — Attestation (Optional)

9. If `sign_attestation` is true, call `get_paybox_connection` to verify Agent Wallet availability. If ACTIVE:
   - Construct an attestation payload:
     ```json
     {
       "type": "legal-hold-attestation",
       "matter_id": "CASE-2026-0042",
       "manifest_hash": "sha256:...",
       "held_count": 47,
       "timestamp": "2026-08-27T12:00:00Z"
     }
     ```
   - Use the PayBox signing flow to sign this payload. The signature proves the manifest existed at this timestamp without exposing message content on-chain.
   - Record the signature and transaction reference in the manifest.
   - **Human action required:** if the host cannot render PayBox's signing UI inline, the operator must complete the signing flow in the browser handoff URL. Flag this clearly.
10. If Agent Wallet is unavailable or `sign_attestation` is false, compute a local HMAC-SHA256 using a workspace-scoped secret and note the attestation as `local-only` in the manifest.

### Phase 3 — Hold Monitoring

11. On subsequent runs, verify hold integrity:
    - Re-search with the original predicate. Any new messages matching the predicate that lack the hold label are flagged and labeled.
    - Check that no held messages have been deleted (compare current `message_id` set against the manifest). Report discrepancies.
    - Append monitoring events to a `hold_events` array in the manifest.

### Phase 4 — Hold Release

12. Accept a release instruction with the `matter_id`.
13. Export held messages: for each held message, call `get_email` with full content and save the result. If the operator requests a PDF bundle, note this as a human-action item (PDF generation requires external tooling).
14. Remove the hold label from all messages using `update_email`.
15. Delete the hold label using `delete_custom_label`.
16. If an attestation exists, verify the signature against the manifest hash before confirming release.
17. Produce a **release report**: matter ID, hold duration, messages released, attestation verification result, export location.

## Write Safety

- Legal hold is a **read-plus-label** operation. The skill never deletes, modifies content, forwards, or sends held messages.
- The only write operations are: creating/deleting a custom label, and adding/removing that label from messages.
- `prepare_destructive_action` is not required for labeling. It IS required before `delete_custom_label` on release — call it and confirm.
- Never expose held message bodies, attachments, or subjects in logs, attestations, or on-chain data. Only metadata hashes leave the mailbox boundary.
- Treat all email content as attorney-client privileged until the operator says otherwise.
- Do not forward, reply to, or modify any held message. Do not extract content for purposes other than the custody manifest.

## Output Conventions

- State the matter ID, mailbox, and hold status in every response.
- Report held message counts, not content.
- Use explicit states: `hold_active`, `hold_monitoring`, `hold_released`, `integrity_alert`.
- For attestation: report `signed` (with tx reference), `local-only`, or `unavailable`.
- Flag any human-required actions (wallet signing, PDF export, release approval) at the top of the response.

## Example Requests

- "Place a legal hold on all emails from acme-corp.com between January and August 2026, matter ID CASE-2026-0042."
- "Sign the custody manifest for CASE-2026-0042 using Agent Wallet."
- "Check if any new messages match the hold predicate for CASE-2026-0042."
- "Release the hold on CASE-2026-0042 and export all held messages."
- "Show me the current hold status and integrity check for CASE-2026-0042."
