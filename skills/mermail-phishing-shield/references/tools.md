# Phishing shield tool contract

This skill owns no tools. It composes inbox tools owned by `mermail-manage-inbox` and discovery from `mermail-administer-workspace`. Use the exact identifier the host exposes (for example `Mermail:list_emails` or bare `list_emails`); do not add, strip, or invent a prefix.

Pass `query` and `body` as native JSON objects. Never stringify them.

## Tools used

| Tool | Purpose | Risk |
| --- | --- | --- |
| `list_mailboxes` | Resolve the mailbox; prefer `public_id` | read |
| `list_emails` | Bounded metadata scan of the inbox | read |
| `search_emails` | Metadata scan within a user-given date window | read |
| `get_email` | One bounded, sanitized body read for a `clean` message | read |
| `list_folders` | Find an existing `Phishing Quarantine` folder | read |
| `create_folder` | Create `Phishing Quarantine` once, after approval | write-preview |
| `move_email` / `bulk_move_emails` | Move approved ids into quarantine | write-preview |
| `list_custom_labels` | Check for an existing phishing label definition | read |
| `create_custom_label` | Define `Crypto phishing` for ongoing detection (admin-only) | write-preview |

Not used: `download_attachment`, every delete tool, every send/reply/forward tool, and every PayBox / Agent Wallet tool.

## Metadata scan

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "query": {
    "folder": "inbox",
    "page": 1,
    "limit": 25,
    "sortColumn": "date",
    "sortDirection": "DESC",
    "metadata_only": true,
    "agent_safe_content": true
  }
}
```

Time-boxed variant with `search_emails`:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "query": {
    "date_start": "2026-09-17T00:00:00Z",
    "folder": "inbox",
    "page": 1,
    "limit": 25,
    "metadata_only": true,
    "agent_safe_content": true
  }
}
```

Handle both response shapes: a bare array or `{ "emails": [...], "totalCount": N }`.

## Bounded body read (clean scans only)

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "emailId": "EMAIL_ID",
  "query": {
    "require_scan_status": "clean",
    "agent_safe_content": true,
    "max_body_chars": 10000
  }
}
```

A scan mismatch returns metadata with `content_omitted: true`. Treat it as `not_inspected`, not as safe.

## Quarantine

1. `list_folders` and look for a folder named `Phishing Quarantine`.
2. If missing, `create_folder`:

```json
{ "mailboxId": "MAILBOX_PUBLIC_ID", "body": { "name": "Phishing Quarantine" } }
```

The folder id is the slug of the name (`phishing-quarantine`). Use the id that `list_folders` or `create_folder` returns.

3. `bulk_move_emails` with only the approved ids:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "body": { "ids": ["EMAIL_1", "EMAIL_2"], "folderId": "phishing-quarantine" }
}
```

For one message, use `move_email` with `emailId` and `{ "body": { "folderId": "phishing-quarantine" } }`.

## Ongoing detection

Custom labels are AI classification definitions; no tool attaches a label to an existing message manually. Call `list_custom_labels` first, then, after approval:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "body": {
    "name": "Crypto phishing",
    "rules": "Crypto phishing: asks for a seed phrase, recovery phrase, or private key; asks to connect, validate, or sync a wallet through a link; fake airdrop or giveaway; sender domain imitates a wallet or exchange but is not its official domain.",
    "color": "#D92D20"
  }
}
```

`create_custom_label` is admin-only, `rules` is 1–500 characters, and a mailbox allows at most 20 definitions.
