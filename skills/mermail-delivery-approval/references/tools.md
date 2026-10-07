# Mermail Delivery Approval — tools

Every name below is an official Mermail MCP tool owned by an existing domain; this skill only composes them. Availability depends on the connection profile: API-key connections expose the email catalog; wallet tools require the full-profile OAuth connection (`https://console.mermail.app/mcp?profile=agent-wallet`).

## Workspace and mailbox setup (owner: administer-workspace / agent-inbox)

| Tool | Use here |
| --- | --- |
| `list_workspaces` | Resolve the credential-bound workspace |
| `list_mailboxes` | Find an existing `delivery-approvals` mailbox before provisioning |
| `create_mailbox` | Provision one approvals mailbox when none fits; keep purpose recorded |
| `get_mailbox` | Confirm receiving status before relying on replies |

## Delivery report (owner: compose-email)

| Tool | Use here |
| --- | --- |
| `send_email` | Send the proof-of-delivery report with the one-time token and TTL |
| `reply_to_email` | Confirm execution, decline, or expiry back in the original thread |

## Approval polling and validation (owner: manage-inbox)

| Tool | Use here |
| --- | --- |
| `search_emails` | Bounded polling filtered by sender, recipient, subject, `date_start` |
| `list_emails` | Fallback newest-first discovery inside the same deadline |
| `get_email` | Metadata-only candidate validation, then bounded clean content for the matched reply |
| `get_email_context` | Only after a unique match, when thread history matters |
| `update_email` | Mark the consumed approval message read/labeled as job bookkeeping |

## Gated action execution

| Tool | Owner domain | Notes |
| --- | --- | --- |
| `forward_email` | compose-email | External effect; only the recipients previewed in the report |
| `schedule_email_send` | compose-email | Release-style sends; verify the returned schedule ID |
| `prepare_destructive_action` | (confirmation) | Short-lived token when the host marks the gated action destructive outside the email-approval contract |

## Optional wallet release (owner: agent-wallet, full-profile OAuth only)

| Tool | Use here |
| --- | --- |
| `get_paybox_connection` | Prove a delegated wallet exists before promising a payment release |
| `create_agent_wallet_transfer_proposal` | Propose the exact pre-authorized transfer after `APPROVE` matches |
| `get_agent_wallet_request` | Poll proposal/request state from the result, never from narrative |
| `paybox_request_transfer` | Live PayBox flow when the connected profile exposes it; signing policy stays in PayBox |

If the connected catalog does not expose a listed wallet tool, stop at the email-approved boundary and report that the `agent-wallet` OAuth profile is required. Do not simulate or claim a release.
