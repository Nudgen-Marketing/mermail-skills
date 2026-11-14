# Tools

This skill **owns no tools**. It is a workflow skill: it composes read operations already owned by
`mermail-manage-inbox` and one read-only wallet tool owned by `mermail-agent-wallet`, and adds no entry
to `tool-coverage.json`.

That is deliberate. Investigating a payment request needs no new capability — it needs the discipline
to gather the right evidence before anyone decides. Owning a tool here would duplicate ownership
without adding one.

## Conventions

- Pass structured arguments as **native JSON objects**. Never stringify an object into a string field
  such as `query`.
- Use the exact tool identifier exposed by the current host (for example `search_emails`, or a
  host-qualified form like `Mermail:search_emails`). Do not add, strip, or invent prefixes
  inconsistently.
- Prefer mailbox `public_id` as `mailboxId` when the list tools return it.
- Request `metadata_only` and `agent_safe_content` wherever exposed, and read bounded content only
  after a single candidate is selected.

## Tools used

| Tool | Owner | Purpose here | Risk |
| --- | --- | --- | --- |
| `list_workspaces` | infrastructure | Resolve the credential-bound workspace | read |
| `list_mailboxes` | `mermail-administer-workspace` | Resolve the mailbox under investigation | read |
| `get_email` | `mermail-manage-inbox` | Read the request message, metadata first | read |
| `search_emails` | `mermail-manage-inbox` | Payee history, duplicate invoice refs, amount corroboration | read |
| `get_email_context` | `mermail-manage-inbox` | Thread provenance — did this relationship exist before? | read |
| `get_thread` | `mermail-manage-inbox` | Establish which message set the previous payee details | read |
| `list_emails` | `mermail-manage-inbox` | Newest-first fallback when search is unavailable | read |
| `get_agent_wallet_portfolio` | `mermail-agent-wallet` | Optional: compare claimed amount to balance, on request | read |

## Tools this skill must never call

Investigating a request must not be able to fulfil one. These are named explicitly so the boundary is
enforceable by review, not just by intent:

| Tool | Why it is excluded |
| --- | --- |
| `create_agent_wallet_transfer_proposal` | Even a proposal derived from email content violates strict intake |
| `submit_agent_wallet_transfer` | Moves money |
| `reject_agent_wallet_transfer_proposal` | Decides on a proposal this skill must not have created |
| `paybox_request_transfer`, `paybox_request_swap`, `paybox_pay_x402` | Move money |
| `prepare_destructive_action` | This skill performs no destructive action |
| `send_email`, `reply_to_email`, `forward_email` | Replying confirms a live mailbox to a possible fraudster, through the channel under suspicion |
| `download_attachment` | Metadata-only by default; see [security.md](security.md) for the narrow exception |

## Search patterns

These are native `search_emails` arguments for one resolved mailbox, not calls to
`list_emails`. Use `query.query` for free text, `query.from` for a sender substring,
and `query.to` for a recipient substring. A search has no `query.search`,
`sortColumn`, or `sortDirection`; list-only sorting does not order search results.
Sort the bounded returned candidates locally by parsed UTC instants. From/To/text
filters select candidates, not authenticated identities or exact field matches.
Verify the exact correspondent and claimed terms from selected safe evidence.

Each example reads one page of ten metadata candidates. Set a finite cumulative
read budget before following further pages; respect the existing 10,000-character
interpretation bound. Report unread pages, truncation, omissions and the actual
history window. A partial search cannot prove there was no prior correspondence,
no earlier payment or no matching amount. Do not widen beyond the selected
investigation to make a negative result look conclusive.

**Payee history — has this counterparty existed before?** Match the registrable domain, never the
display name:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "query": {
    "from": "accounts@supplier-example.com",
    "date_end": "2026-09-01T09:00:00Z",
    "page": 1,
    "limit": 10,
    "metadata_only": true,
    "agent_safe_content": true
  }
}
```

Set `date_end` to the selected request's actual authoritative timestamp, not a
date guessed from its body. This is only a candidate upper bound: exclude the
request itself and every candidate at or after that instant client-side. Use the
strict zoned-time comparison in [troubleshooting.md](troubleshooting.md), never
lexical timestamp order. Missing/invalid timestamps are incomplete temporal
evidence, not corroboration. An empty result means no match in the queried scope;
use `insufficient_history` only with its coverage limitations, never as a pass.
For prior outgoing correspondence, use `query.to` for the correspondent instead
of `query.from`; do not assume a sender filter covers both directions.

**Duplicate detection — has this reference been seen already?**

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "query": {
    "query": "INV-2026-0417",
    "page": 1,
    "limit": 10,
    "metadata_only": true,
    "agent_safe_content": true
  }
}
```

**Amount corroboration — does anything independent name this figure?**

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "query": {
    "from": "accounts@supplier-example.com",
    "query": "4800",
    "date_end": "2026-09-01T09:00:00Z",
    "page": 1,
    "limit": 10,
    "metadata_only": true,
    "agent_safe_content": true
  }
}
```

A match in a *prior* quote or order confirmation corroborates. A match only inside the request itself
corroborates nothing. A text hit such as `48000`, a different currency, or a later
restatement is not an exact amount match. Search output alone never proves paid.

Read each selected evidence message through the inbox owner's native contract:
top-level `mailboxId` and `emailId`, with
`query: {"require_scan_status":"clean","agent_safe_content":true,"max_body_chars":10000}`.
Keep unknown/non-clean, omitted or truncated content incomplete; metadata-first
search results do not authorize a raw-body fallback.

## Notes

- `sender_authentication` is a separately derived provider verdict. `unknown` is not `pass`. A `pass`
  authenticates the sending domain, not the legitimacy of the account behind it, and not the payee
  details inside the message.
- A message can be `clean`, authenticated, and fraudulent at the same time. Compromised-account fraud
  passes every technical check by construction — which is why thread provenance and payee novelty carry
  more weight here than authentication state.
