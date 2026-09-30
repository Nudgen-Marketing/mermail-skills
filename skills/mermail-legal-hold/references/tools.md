# Legal-hold tool reference

## Required MCP tools (full-catalog profile)

These are the exact Mermail MCP tools this skill uses, with their role:

### Read operations (no approval needed)
| Tool | Purpose |
|---|---|
| `list_workspaces` | Resolve credential-bound workspace |
| `list_mailboxes` | Find target mailbox |
| `get_mailbox` | Verify mailbox status |
| `search_emails` | Find messages matching hold predicate |
| `get_email` | Read message metadata for manifest (metadata_only on hold; full on release export) |
| `get_thread` | Expand to full thread when hold_scope=threads |
| `get_email_context` | Thread context for custody manifest |
| `list_custom_labels` | Check for existing hold labels |

### Write operations (labeling only — never modifies message content)
| Tool | Purpose |
|---|---|
| `create_custom_label` | Create `LEGAL-HOLD::<matter_id>` label |
| `update_email` | Apply/remove hold label on messages |
| `delete_custom_label` | Remove hold label on release (requires `prepare_destructive_action`) |
| `prepare_destructive_action` | Required before `delete_custom_label` |

### Agent Wallet operations (optional, attestation only)
| Tool | Purpose |
|---|---|
| `get_paybox_connection` | Check wallet availability; must be called first |
| PayBox signing flow | Sign custody manifest hash (tool name varies by live catalog) |

## Label naming convention

```
LEGAL-HOLD::<MATTER_ID>
```

Examples:
- `LEGAL-HOLD::CASE-2026-0042`
- `LEGAL-HOLD::GDPR-DSAR-2026-117`
- `LEGAL-HOLD::SOX-AUDIT-Q3`

Color: `#DC2626` (red) for immediate visual identification.

## Manifest schema

```json
{
  "schema_version": "1.0.0",
  "matter_id": "string (required)",
  "hold_placed_at": "ISO 8601 timestamp",
  "mailbox_email": "string",
  "mailbox_id": "string (public_id)",
  "search_predicate": {
    "from": "string (optional)",
    "to": "string (optional)",
    "subject": "string (optional)",
    "date_start": "ISO 8601 (optional)",
    "date_end": "ISO 8601 (optional)"
  },
  "hold_label_id": "string",
  "held_messages": [
    {
      "message_id": "string",
      "thread_id": "string",
      "from": "string",
      "to": ["string"],
      "subject": "string",
      "date": "ISO 8601",
      "scan_status": "string"
    }
  ],
  "total_held": "integer",
  "manifest_hash": "sha256:<hex>",
  "attestation": {
    "type": "signed | local-only | unavailable",
    "signature": "string (optional)",
    "tx_reference": "string (optional)",
    "signed_at": "ISO 8601 (optional)"
  },
  "hold_events": [
    {
      "event": "placed | monitored | new_match | integrity_alert | released",
      "timestamp": "ISO 8601",
      "detail": "string"
    }
  ]
}
```

Manifests are stored locally as `hold-<matter_id>.json`. The `manifest_hash` is SHA-256 of the canonical JSON (sorted keys, no whitespace, UTF-8).
