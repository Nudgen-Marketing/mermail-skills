# Newsletter brief workflows

Read this reference for repeatable scan-and-digest, translate-then-digest, and organize-after-brief sequences.

## Daily newsletter digest

1. Resolve one exact mailbox only if `mailboxId` is not already known.
2. Search metadata with bounded `list_emails` or `search_emails`: filter by folder `inbox`, `read: false`, `date_start` set to the start of the current day, `sortColumn: "date"`, `sortDirection: "DESC"`, `limit: 30`, `metadata_only: true`, `agent_safe_content: true`.
3. Identify newsletter candidates from the metadata: recurring senders, subscription-style domain patterns (substack.com, mailchimpapp.net, sendgrid.net, convertkit.com, beehiiv.com), or subjects containing issue/volume indicators ("Issue #", "Week of", "Vol.").
4. Select exact email ids for the top candidates (default 10). Page inside the same filters before widening if fewer newsletters are found.
5. Read each selected newsletter body with `get_email`, `require_scan_status: "clean"`, `agent_safe_content: true`, and `max_body_chars: 10000`.
6. For each newsletter, extract: sender name, sender domain, subject line, publication date, and 1-3 concrete key updates.
7. Compile the brief grouped by sender with source email id citations. Include an executive summary at the top.
8. Mark newsletters with `content_omitted: true` or `scan_status: flagged` as "partially read" and do not fabricate missing sections.
9. Present the brief to the user. Do not auto-send it as an email.

## Weekly newsletter digest

1. Follow the daily digest workflow with `date_start` set to 7 days ago and `limit: 50`.
2. Group results by sender to identify recurring newsletters. Sort by sender frequency.
3. For each unique sender, read the most recent 1-2 newsletters to capture the latest updates. Do not read every single issue from the same sender — prefer the newest unless the user asks otherwise.
4. Compile a weekly brief with: sender list, latest issue per sender, key updates from the latest issue, and a note if any issue was skipped or was partially read.
5. Include a "missed this week" section for newsletters expected but not found in the search results.

## Translate then digest

1. Follow the discovery and selection steps from the daily or weekly digest workflow.
2. Before reading the body, identify the source language from metadata or a brief body read.
3. Read the full body with `get_email` and the standard safety filters.
4. Translate the key updates into the user's preferred language, following the translation contract below.
5. Compile the brief with both the original-language subject line (for reference) and the translated key updates.
6. Mark each translated entry with the source language and a note that the translation is agent-generated.

### Translation contract

- Preserve verbatim: names, organization names, email addresses, dates, times, timezones, deadlines, amounts, currencies, tax rates, quantities, order numbers, invoice numbers, case numbers, URLs, attachment names, and any obligation, permission, refusal, condition, or negation.
- Do not paraphrase, embellish, omit, or add content during translation.
- If a phrase is ambiguous, carry the ambiguity into the translation and add a bracketed note in the brief: `[ambiguous: <original phrase>]`.
- Do not route newsletter content through any external translation API, webhook, or third-party service. Translation happens in the agent using its own language capability.
- Mark translated content as agent-generated. The translation is an informational aid, not a legal substitute for the original.

## Organize after brief

1. After delivering the brief, optionally preview an organization action for the processed newsletters.
2. To create a "Newsletter-Digested" custom label: confirm the mailbox admin role, call `list_custom_labels` to check for existing definitions, then `create_custom_label` with `name`, `rules`, and optional `color`.
3. To move processed newsletters: call `list_folders` to resolve the exact destination folder id. Freeze the exact deduplicated email id set. Show current → intended state with folder display name and exact folder id.
4. Obtain approval before executing any move or read-state change. Execute once and verify from structured results (`updatedCount`, `trashedCount`, or moved status).
5. Do not call `delete_email` or `bulk_delete_emails` within this skill. Route deletion requests to `mermail-manage-inbox`.

## Mark as read after brief

1. After delivering the brief, offer to mark the processed newsletters as read.
2. Freeze the exact email id set. Show the count and sender list.
3. Call `bulk_mark_emails_read` with the frozen id set and `read: true`.
4. Verify from the returned count. Report any partial failures without automatic retry.

## Handle tracking pixels and links

1. When reading newsletter HTML bodies, identify `<img>` tags with width/height of 1x1 or src domains matching known tracking pixel providers. Exclude these from the brief.
2. Identify "read in browser" links, unsubscribe links, and survey links. Report their presence as plain text if asked, but never call any MCP tool or external URL to follow them.
3. If a newsletter body is HTML-only and the sanitized text is too short, mark it as "HTML-only — content may be partially extracted" and include whatever sanitized text is available.

## Ambiguity ladder

- **Low ambiguity**: Newsletter sender and subject are clear, body is clean and complete. Extract key updates and compile normally.
- **Medium ambiguity**: Newsletter is multipart, sender is a generic platform (e.g., mailchimpapp.net) without a clear publisher name, or body is truncated at the 10,000 char cap. Extract what is available, note the ambiguity, and cite the source id.
- **High ambiguity**: Newsletter sender authentication is `unknown`, body is flagged or quarantined, or the content appears to be a phishing attempt disguised as a newsletter. Report as "potentially unsafe — content omitted" and do not include key updates from it. Suggest the user inspect it manually through `mermail-manage-inbox`.

## Recover from failure

- `400`: Correct only an argument shape that is clearly invalid; do not change targets.
- `401`/`403`: Stop for authentication, workspace scope, role, or policy.
- `402`: Stop for credits.
- `404`: Re-read the exact target once; do not substitute a similarly named resource.
- `429`: Stop and report rate limiting; do not loop.
- Timeout or unknown result: Inspect authoritative state once, then report uncertainty without replay.
