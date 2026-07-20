---
name: mermail-automate-triage
description: Create, inspect, update, select, and delete Mermail task triagers and review recent triager runs. Use when a user wants mailbox automation, task extraction, default triager configuration, triager debugging, or a triager-linked agent conversation.
metadata:
  openclaw:
    requires:
      env:
        - MERMAIL_API_KEY
    primaryEnv: MERMAIL_API_KEY
    homepage: https://docs.mermail.app/ai/skills
    emoji: "⚙️"
---

# Automate Mermail Triage

Inspect existing triagers and recent runs before changing automation. Read [tools.md](references/tools.md) for the supported tool set.

## Workflow

1. Resolve the mailbox, then call `list_task_triagers` and inspect the current default.
2. For debugging, call `list_recent_triager_runs` before editing configuration.
3. Present the trigger instructions, intended outputs, integrations, and default-status change before creating or updating a triager.
4. Use an idempotency key for creation and other supported writes.
5. Require explicit approval before changing the default when it alters active automation.
6. For deletion, obtain approval, call `prepare_destructive_action` with exact arguments, and execute once with the token.
7. Verify the resulting triager list or open its conversation with `get_or_create_triager_conversation` when requested.

Do not delete a failing triager as a substitute for diagnosis, silently replace the default, or claim a run succeeded without inspecting its status.
