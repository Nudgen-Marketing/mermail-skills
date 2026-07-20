---
name: mermail-administer-workspace
description: Inspect Mermail API and email usage and manage workspaces, members, invitations, email domains, mailboxes, and storage. Use for workspace administration, access changes, domain verification, mailbox provisioning or settings, storage checks, plan usage, RPM, or credits.
metadata:
  openclaw:
    requires:
      env:
        - MERMAIL_API_KEY
    primaryEnv: MERMAIL_API_KEY
    homepage: https://docs.mermail.app/ai/skills
    emoji: "🏢"
---

# Administer Mermail Workspace

Resolve and preserve the API key's workspace boundary. Read [tools.md](references/tools.md) for tool ownership and approval requirements.

## Workflow

1. Use list/get tools to resolve the workspace, member, domain, or mailbox and show current state.
2. Check `get_api_credit_usage` or `get_email_usage` before a large or costly workflow when usage is relevant.
3. Validate requested roles, invite recipients, domain names, and mailbox settings against the current MCP schema.
4. Preview access, routing, or ownership impact before writes. Require explicit approval for invitations and destructive changes.
5. For deletion or member removal, call `prepare_destructive_action` with exact arguments after approval, then execute once with the returned token.
6. Re-read the affected resource to verify state when a read endpoint is available.

Do not cross workspace boundaries, expose DNS secrets, infer ownership transfer, or bypass Developer-plan requirements for email-domain operations.
