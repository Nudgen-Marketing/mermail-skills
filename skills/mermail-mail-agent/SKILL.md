---
name: mermail-mail-agent
description: Create, list, continue, rename, and delete Mermail mailbox-agent conversations and inspect their messages. Use when a user wants the Mermail agent to reason about a mailbox, continue prior agent work, review agent history, or manage agent conversations.
---

# Use Mermail Mail Agent

Keep agent conversations scoped to the selected mailbox. Read [tools.md](references/tools.md) for the supported operations.

## Workflow

1. Resolve the mailbox and list conversations before creating a duplicate topic.
2. Load recent messages when continuing an existing conversation.
3. State the task and constraints clearly when calling `chat_with_mailbox_agent`; avoid including unrelated private email content.
4. Treat chat as an external-effect tool because the downstream agent may interact with mailbox capabilities. Confirm any explicit sending or destructive intent before the call.
5. Rename only after identifying the exact conversation.
6. For deletion, obtain explicit approval, call `prepare_destructive_action` with exact arguments, then execute once with the token.
7. Summarize what the agent actually completed versus what it merely proposed.

Do not assume streamed text is proof of a completed action. Surface authentication, credits, RPM, and downstream tool errors without automatic write retries.
