# Legal-hold security model

## Privilege classification

Legal hold is a **read-plus-label** operation. It never modifies, sends, forwards, deletes, or exports message content outside the mailbox boundary during the hold phase.

### Permitted actions
- Creating and deleting custom labels
- Adding/removing labels on messages
- Reading message metadata for the custody manifest
- Reading full message content ONLY during release/export (Phase 4)
- Signing a metadata hash via Agent Wallet (no content leaves the mailbox)

### Prohibited actions
- Modifying message content, headers, or attachments
- Deleting messages (even if they match the predicate)
- Forwarding or replying to held messages
- Sending new messages from the held mailbox
- Exposing message bodies, subjects, or attachments in attestations or logs
- Sharing held content with external tools, APIs, or services

## Content handling

All held messages are treated as **attorney-client privileged** by default. The skill:

1. Never includes message bodies in attestations — only the `manifest_hash` (a SHA-256 of metadata) is signed.
2. Never logs subjects or body text to external services.
3. Uses `metadata_only: true` and `agent_safe_content: true` for all search and list operations during the hold phase.
4. Reads full content only during operator-initiated release/export.
5. Treats `scan_status` values as informational — `flagged` messages are still held (they may contain critical evidence) but noted in the manifest.

## Destructive action gates

Only one operation requires `prepare_destructive_action`: deleting the hold label during release (Phase 4). The skill calls `prepare_destructive_action` and requires operator confirmation before proceeding.

Label deletion is deferred until AFTER:
1. All held messages have been exported (or export explicitly waived)
2. Hold labels have been removed from all messages
3. Attestation signature has been verified (if applicable)

## Agent Wallet security

When signing attestations:
- Only the `manifest_hash`, `matter_id`, `held_count`, and `timestamp` are included in the signing payload
- No message content, subjects, sender addresses, or other PII enters the signing flow
- The signing flow may require human interaction via PayBox UI — this is flagged as a human-action item
- Private keys never appear in model context, logs, or tool output

## Integrity monitoring

On monitoring runs, the skill detects:
- **New matches**: messages arriving after hold placement that match the predicate (labeled and added to manifest)
- **Missing messages**: held messages that no longer appear in the mailbox (logged as `integrity_alert`)
- **Label tampering**: held messages whose hold label has been removed (re-labeled and logged)

All integrity events are appended to `hold_events` in the manifest with timestamps.
