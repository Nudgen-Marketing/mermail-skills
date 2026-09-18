# Tools contract — mermail-bounty-radar

This skill claims no tools. It uses the official Mermail MCP tools below with
the exact contracts stated here. Do not invent tool names or parameters.

## list_mailboxes

Resolve the working mailbox. Prefer the returned `public_id`.

```
list_mailboxes()
```

## search_emails

Bounded discovery. `query` is a **native JSON object**, never a stringified
JSON string. Use only live schema fields.

```
search_emails({
  query: { keywords: [...], date_start: "<ISO>" },
  metadata_only: true,
  agent_safe_content: true,
  sortColumn: "date",
  sortDirection: "DESC",
  limit: 25
})
```

## list_emails

Newest-first fallback when search returns nothing.

```
list_emails({ sortColumn: "date", sortDirection: "DESC", limit: 25, metadata_only: true })
```

## get_email

Metadata-only selection first, then one bounded clean read per selected id.

```
get_email({ id: "<email-id>", metadata_only: true })
get_email({ id: "<email-id>", agent_safe_content: true })
```

## get_email_context

Bounded sanitized page around one already-selected message, oldest-first.
Follow `next_cursor` only as far as the task requires. Never use thread
context to choose among ambiguous candidates or to broaden the task.

## Opportunity contract (extractor output)

```json
{
  "sponsor": "string",
  "program": "string",
  "prize_amount": 0,
  "prize_currency": "USDC",
  "deadline": "2026-10-07T13:59:00Z",
  "chain": "Solana",
  "requirements": { "kyc": "none|at-payout|upfront", "investment": false, "geo": [], "format": [] },
  "links": { "listing": "https://…", "rules": "https://…" },
  "source_email_id": "…"
}
```

Missing fields stay `null` — never infer a deadline, prize, or requirement
that the email does not state.
