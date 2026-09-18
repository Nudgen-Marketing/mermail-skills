---
name: mermail-administer-workspace
description: Inspect Mermail API, email, and AI-credit usage and manage workspaces, members, invitations, email domains, mailboxes, and storage. Use for workspace administration, access changes, domain verification, mailbox provisioning or settings, storage checks, plan usage, RPM, or credits. Do not use for generic inbox work, composing mail, or third-party app execution.
metadata:
  openclaw:
    requires:
      env:
        - MERMAIL_API_KEY
    primaryEnv: MERMAIL_API_KEY
    homepage: https://docs.mermail.app/ai/skills
    emoji: "🏢"
---

# Mermail Workspace Administration

## Overview

Use this skill to turn authenticated Mermail workspace state into clear usage reports and safe administrative changes. Ground every decision in exact workspace, member, domain, mailbox, plan, usage, and storage evidence, and preserve the credential-bound workspace boundary.

Read [tools.md](references/tools.md) for the owned MCP tools and approval requirements.

## Preferred Deliverables

- Workspace usage summaries with current API credits, AI-credit usage/events, email usage, storage, and relevant limits.
- Exact member, invitation, role, domain, mailbox, or settings change proposals showing current and intended state.
- Domain verification summaries with current status and the smallest safe next action.
- Mailbox provisioning results stating whether an existing mailbox was reused or one new mailbox was created for 10 provision credits.
- Final verification reports that distinguish completed, pending, partially failed, blocked, and unverified changes.

## Workflow

1. Resolve the credential-bound workspace and the exact member, invitation, domain, or mailbox before reasoning about a change. Use stable IDs returned by list/get tools; never invent an ID or cross into another workspace.
2. Read and show the relevant current state first. Use `get_api_credit_usage`, `get_ai_credit_usage`, `list_ai_credit_events`, `get_email_usage`, or storage reads before a large or costly workflow when usage is material. Follow each tool's current live schema and do not infer missing periods, event fields, or units.
3. Resolve ambiguity before writing. When multiple similarly named workspaces, members, domains, or mailboxes remain, present the smallest non-secret distinguishing metadata and ask the user to choose.
4. Always call `list_mailboxes` or `list_workspace_mailboxes` before `create_mailbox`. Reuse a suitable exact mailbox instead of provisioning a duplicate, and do not retry an uncertain create blindly.
5. Validate requested roles, invite recipients, domain names, mailbox addresses, and settings against the current live schema. `create_mailbox` requires `email` and `name` and costs 10 provision credits. For credential-bound MCP, `workspaceId` is optional when the live schema permits omission; pass the exact resolved workspace ID only when the transport or schema requires it.
6. Check role and plan prerequisites before proposing a write. Do not bypass Developer-plan requirements for email-domain operations or imply that the skill elevates the authenticated credential's permissions.
7. Preview the exact access, routing, ownership, domain, mailbox, or usage impact before a write. For invitations and resends, identify the exact recipient and workspace and obtain approval before creating the external effect.
8. For `remove_workspace_member` or `delete_email_domain`, obtain explicit approval, call `prepare_destructive_action` with the exact tool name and arguments, then execute once with the returned single-use token. Do not broaden the approved target set.
9. Re-read the affected resource when a read endpoint exists. Report the tool result as unverified when no independent read is available; never infer success from narrative text or an uncertain response.

## Write Safety

- Preserve workspace boundaries, existing access, routing, domain configuration, and mailbox settings unless the user explicitly asks to change them.
- Treat role changes, invitations, domain changes, mailbox provisioning, and settings updates as writes. Show the exact target and intended effect before acting when the user's request is not already explicit.
- Treat member removal and domain deletion as destructive. Require fresh exact approval and a matching single-use `prepare_destructive_action` token.
- Do not call or invent `delete_workspace`; the current MCP catalog does not expose it.
- Do not infer ownership transfer, silently change another member's role, expose credentials or DNS secrets, or convert an ambiguous name into an administrative target.
- Make one authorized mailbox provision after discovery. On conflict, re-list and reuse only an exact suitable concurrent match; do not loop through write retries.
- Stop on authorization, plan, credit, or rate-limit failures such as `401`, `402`, `403`, or `429`. Explain the actionable cause without exposing secrets or bypassing the restriction.
- Respect the live schema and authenticated role over examples in this skill. A skill guides tool use; it never grants workspace or Developer-plan permissions.

## Output Conventions

- Identify the workspace and affected resource with stable IDs plus the smallest useful human-readable label.
- Present usage with exact values, units, limits, and measurement windows returned by Mermail; do not estimate missing data.
- For proposed changes, show a concise current → intended diff and state whether approval is still required.
- For invitations, report the exact recipient and status without exposing tokens or private delivery metadata.
- For domains, report the normalized domain, verification state, plan restriction, and next safe action without exposing DNS secrets.
- For mailbox creation, report normalized email, stable `public_id`, reused or provisioned state, and the 10-credit cost when creation occurred.
- Distinguish `completed`, `pending`, `partial_failure`, `blocked`, and `unverified`; include the exact remaining action for non-terminal states.

## Example Requests

- "Show this workspace's API credits, AI-credit usage, recent AI-credit events, email usage, and storage."
- "Invite alex@example.com to this workspace as a member."
- "Change this member from viewer to admin after showing me the impact."
- "Add and verify example.com as an email domain."
- "Create support-eu@mermail.app only if an exact usable mailbox does not already exist."
- "Remove the selected member from this workspace."
