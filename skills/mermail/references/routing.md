# Mermail routing

| Request intent | Skill |
| --- | --- |
| Read, search, move, label, organize, download, or delete mail | `mermail-manage-inbox` |
| Draft, regenerate, send, reply, forward, or schedule mail | `mermail-compose-email` |
| Inspect usage or manage workspaces, members, domains, mailboxes, or storage | `mermail-administer-workspace` |
| Configure task triagers, defaults, or inspect triager runs | `mermail-automate-triage` |
| Create or continue mailbox-agent conversations | `mermail-mail-agent` |

For cross-domain requests, resolve workspace and mailbox once, complete read-only discovery, then execute each focused workflow in dependency order. If a focused skill is unavailable, ask the user to install it rather than improvising a broad write workflow.
