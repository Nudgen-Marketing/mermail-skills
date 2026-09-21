# Mermail Inbox Triage and Drafting Skill

This skill lets an AI agent use Mermail to triage an inbox, identify urgent
messages, and prepare a response draft without sending anything until a human
operator approves it.

## What It Enables

- List all Mermail mailboxes available to the current workspace.
- Inspect a mailbox and read recent messages.
- Search email threads by sender, subject, or body text.
- Classify inbound mail into priority buckets: urgent, reply-needed,
  informational, and ignore.
- Draft a concise, review-ready reply for selected messages.
- Use `prepare_destructive_action` before any send operation so a human can
  approve the final action.

## Mermail Interaction

The skill uses the Mermail MCP server:

- Endpoint: `https://console.mermail.app/mcp`
- Transport: Streamable HTTP
- Authentication: OAuth 2.1 for interactive use, or a project API key for
  automation.

The MCP tools used are:

- `prepare_destructive_action`
- `list_mailboxes`
- `get_mailbox`
- `search_emails`
- `save_draft`
- `send_email`

This skill never calls `send_email` without first preparing the action and
obtaining explicit human approval.

## Workflow

1. Run `list_mailboxes` to discover the inboxes available to the agent.
2. Select one mailbox and run `get_mailbox` to confirm its address and status.
3. Run `search_emails` with a time window, sender, or keyword filter.
4. Read the returned snippets and classify each thread:
   - `urgent`: the sender is waiting, the topic is time-sensitive, or the
     message asks a direct question.
   - `reply-needed`: a response is useful but not urgent.
   - `informational`: a notification, receipt, newsletter, or status update.
   - `ignore`: spam, duplicate noise, or already-handled threads.
5. For each `urgent` or `reply-needed` item, create a draft with `save_draft`.
6. Present the drafts to the operator in one review list.
7. For each approved draft, run `prepare_destructive_action` and then
   `send_email` only after the operator confirms the prepared action.

## Example Prompts

```text
Triage my support inbox from the last 24 hours and draft replies for anything
that looks urgent.
```

Expected result:

```text
Found 18 messages.
Urgent: 2
Reply-needed: 3
Informational: 10
Ignore: 3
Drafts created for the 5 actionable messages.
No email was sent.
```

```text
Search for messages from payments@example.com and summarize what they ask.
```

Expected result:

```text
Found 4 messages from payments@example.com.
Two are payment confirmations, one asks for a missing invoice, and one asks
for a refund timeline.
```

## Safety Rules

- Do not include secrets, authorization codes, refresh tokens, or API keys in
  prompts, logs, drafts, or final messages.
- Treat the MCP access token as a bearer credential and never print it.
- Use `prepare_destructive_action` before any send, forward, or destructive
  operation.
- Keep every draft reversible until the operator approves it.
