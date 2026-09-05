# Competitive-round tool contract

This skill owns zero MCP tools. It orchestrates the canonical tools below and must not add a second owner in `tool-coverage.json`.

The packaged deterministic runtime is the authority boundary for this workflow. Supplier workers receive one lane packet and no Mermail MCP tools. Mermail reads and the approval-bound external effect path are owned by the direct adapter/gateway under `scripts/runtime/mcp` and `scripts/runtime/effects`; the LLM is never given `send_email` as a shortcut.

| Intent | Canonical tool | Owner | Effect |
| --- | --- | --- | --- |
| Discover usable buyer mailboxes | `list_mailboxes` | `mermail-administer-workspace` | Read |
| Search or list lane mail | `search_emails`, `list_emails` | `mermail-manage-inbox` | Read |
| Read one selected message or bounded context | `get_email`, `get_email_context` | `mermail-manage-inbox` | Read |
| Reconstruct a selected conversation | `get_thread` | `mermail-manage-inbox` | Read |
| Preserve a reviewed unsent proposal | `save_draft` | `mermail-compose-email` | Internal write |
| Send a new RFQ or BAFO request | `send_email` | `mermail-compose-email` | External effect |
| Reply inside a selected supplier lane | `reply_to_email` | `mermail-compose-email` | External effect |

Use the exact tool schema exposed by the current Mermail host. Pass `query` and `body` as native JSON objects, never stringified JSON. Do not invent thread, delivery, approval, or sourcing tools, and do not silently add a profile selector or alternate endpoint.

The accepted live profile observed 79 tools. That count is discovery evidence only. This Skill owns only the read primitives required for mailbox/source binding and the explicitly approved `send_email`/`reply_to_email` surfaces through its deterministic adapter; unknown or drifted load-bearing schemas fail closed.

## Evidence reads

Resolve the mailbox before reading. Search or list within that mailbox, narrow by the frozen sourcing and round markers, and then fetch selected messages and threads. A search hit is a candidate, not proof: validate exact mailbox, sender, recipient, subject, timestamp, direction, and message identity before using the content. Use bounded polling when a send result is `queued`; stop on an ambiguous or unauthorized read.

Mermail `emailId` values are mailbox-local. Every evidence record and every reply source must retain the pair:

```json
{
  "mailboxId": "mailbox-that-contains-the-message",
  "emailId": "mailbox-local-message-id"
}
```

Also retain the expected local sender, remote counterparty, `sourcing_id`, `round_id`, supplier ID, lane ID, and thread ID when returned. Never use an email ID discovered in one mailbox with another mailbox. `reply_to_email` uses the selected source email as a top-level source parameter under the live schema; its `mailboxId` must identify the mailbox that contains that source. The outbound `from` must be the expected identity for that mailbox and lane, and the explicit `to` must be the intended counterparty.

## External payloads

For `send_email` and `reply_to_email`, preserve the live schema's top-level path fields and nested `body` fields. Preview, at minimum:

```json
{
  "mailboxId": "buyer-or-supplier-mailbox-id",
  "emailId": "source-email-id-when-replying",
  "idempotencyKey": "one-stable-key-for-this-effect",
  "body": {
    "from": "expected-local-identity",
    "to": "one-intended-counterparty",
    "cc": [],
    "bcc": [],
    "subject": "exact-subject",
    "text": "exact-body"
  }
}
```

The illustrative values above are placeholders for the exact live request, not permission to call a tool. Include `cc` or `bcc` only when explicitly authorized and non-empty. For a reply, do not infer Reply All from headers; bind the source and pass the intended recipient explicitly according to the live schema. Do not put internal comparison material in `body`.

## Effect reconciliation

The authoritative send result and the recipient's actual received message are separate evidence. Record the returned message ID, thread ID, idempotency key, status, and timestamp when exposed. A `queued` response is not recipient receipt. If a write times out, returns an uncertain status, or cannot be reconciled, inspect live state once and stop; never replay with a new key or a different tool.

`save_draft` may be used for review, but a draft-folder item is never a supplier response, offer revision, or receipt. Keep draft evidence in a separate list and exclude it from the commercial chronology.
