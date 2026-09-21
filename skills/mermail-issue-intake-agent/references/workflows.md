# Issue intake workflows

## One report to one reviewed issue

1. Resolve the workspace and mailbox with `list_mailboxes`.
2. Use `search_emails` with the narrowest user-relevant query and limit.
3. Inspect metadata, then call `get_email` for the selected message. Use `get_email_context` only when prior messages are needed.
4. Apply the intake and sanitization rules in [security.md](security.md).
5. Build the candidate body:

   ```markdown
   ## Summary
   <one concise observed problem>

   ## Steps to reproduce
   1. <verified step or "Not provided">

   ## Expected behavior
   <verified expectation or "Not provided">

   ## Actual behavior
   <verified observation>

   ## Environment
   <verified version/platform or "Not provided">

   ## Evidence
   <safe evidence description; no secrets or personal data>
   ```

6. Require an active GitHub connection from `list_composio_connections`. Discover the provider search operation, inspect its schema, and search only the target repository.
7. If a strong duplicate exists, return its URL and explain the matching facts. Do not create another issue.
8. Otherwise present the exact preview and wait for fresh approval.
9. Recheck the live issue-creation schema, then call `execute_composio_tool` once with the approved payload.
10. Accept success only from an authoritative issue number or URL.

## Optional acknowledgement

1. Use the created or duplicate issue URL returned by GitHub; never invent one.
2. Draft a short acknowledgement that confirms receipt, links the issue, and avoids promising a resolution date.
3. Save with `save_draft` when the user requested draft preparation.
4. To deliver, show the exact sender, recipients, subject, and body, then require fresh approval before one `reply_to_email` call.

## Uncertain issue creation

When `execute_composio_tool` times out or returns an ambiguous result, run one bounded search in the same repository using the exact approved title. If no authoritative match appears, report `uncertain` and stop. Do not create a replacement issue automatically.
