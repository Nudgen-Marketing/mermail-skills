# Inbox readiness workflows

Four sequences. Stop at the first one that cannot complete and report why.

## 1. Headroom before provisioning

1. `list_workspaces`, then `get_workspace` for the selected workspace.
2. `get_api_credit_usage`, `get_email_usage`, `get_workspace_storage`.
3. Report the returned numbers. State the `create_mailbox` cost as 10 provision credits.
4. If credits cannot cover a provision, stop before provisioning and offer reuse instead.

## 2. Resolve or provision one mailbox

1. `list_mailboxes` (add `list_workspace_mailboxes` for a multi-mailbox audit).
2. Prefer a ready mailbox and use its `public_id` as `mailboxId`. Skip mailboxes reserved for an active third-party verification flow; those belong to `mermail-agent-inbox`.
3. `get_mailbox` and `get_mailbox_storage` for evidence.
4. `list_email_domains` for the sending domain. Report verified only when the tool says verified.
5. Provision only when nothing fits: preview the exact `email` and `name`, get authorization, call `create_mailbox` once. Do not loop through write retries.

## 3. Round-trip delivery self-test

1. Compose a probe whose recipient is a mailbox in this workspace, normally the mailbox itself.
2. Use a unique, human-readable subject, for example `Mermail readiness probe <date>-<suffix>`, and a body that states it is a self-test.
3. Preview exact `from`, `to`, subject, and body. Wait for fresh approval. `save_draft` while the body is still being revised.
4. `send_email` once with `body.from` = mailbox email, explicit `to`, `body.text` and/or `body.html`, and one idempotency key.
5. Poll `search_emails` (or `list_emails`) against the probe subject in a narrow window with capped retries. State the cap before starting.
6. On arrival, `get_email` and quote `sender_authentication.status` and `scan_status` verbatim.
7. On no arrival within the cap, report `probe_missing` and `degraded`. Do not extend the wait and do not send a second probe without a new approval.

## 4. Routing surface and optional monitoring

1. `list_folders` and `list_custom_labels` for the surface a downstream workflow will address.
2. `create_folder` / `create_custom_label` only for an exact name the user asked for.
3. `list_task_triagers` and `list_recent_triager_runs` before creating anything.
4. `create_task_triager` limited to classification and draft-only output. Do not call `set_default_task_triager`.
5. Hand the mailbox to the named next skill: `mermail-agent-inbox`, `mermail-manage-inbox`, `mermail-support-agent`, `mermail-gtm-agent`, or `mermail-scheduling-agent`.

## Verdict table

| Verdict | Meaning |
| --- | --- |
| `ready` | Mailbox resolved, domain state read, probe received, `sender_authentication.status` `pass`, `scan_status` `clean` |
| `degraded` | Delivered but a check returned `unknown`, or the probe was skipped or not authorized |
| `blocked` | Connection, headroom, authorization, or delivery failed; name the failed check |

## Rehearsing without credentials

The hosted Mermail MCP server needs an `sk-proj-` API key that is minted through a browser
sign-in, so a builder cannot try this workflow the minute they read it. A 183-line offline
stand-in is published so they can:

    https://github.com/machine-of-earn/mermail-inbox-readiness-demo/tree/main/rehearsal

Register `rehearsal/mermail_mock.py` as a stdio MCP server, then drive the skill with any of
the prompts below. It answers the 15 tools this skill routes to, with response shapes taken
from `references/tools.md`, and it deliberately returns
`sender_authentication.status: "unknown"` on a domain whose SPF and DKIM both pass — so a
rehearsal has to exercise the rule the skill is built around: `unknown` is not `pass`. A
correct rehearsal ends on `degraded`, never on `ready`. `send_email` also answers `conflict`
on a replayed idempotency key, so the "no second probe without a new approval" branch is
reachable offline.

It is a rehearsal harness, not a substitute: a run against the mock proves the workflow,
never the service. Recorded demos are made against `https://console.mermail.app/mcp`.

## Example prompts and expected results

Each example gives the triggering prompt and the shape of the report the skill is
expected to end on. The values in a real run come from the tools; never fill one in
from memory.

### "Stand up a Mermail mailbox for my new agent and prove it can receive mail."

Expected: headroom read first, then a mailbox resolved by reuse or one previewed
provision, then one previewed probe, ending on a verdict block.

```
mailbox  agent-ops@<verified-domain>  (public_id <id>)  provisioned
headroom credits <n> remaining · provision cost 10 · email usage <n>/<n> · storage <n>/<n>
domain   <domain> — <status as list_email_domains returned it>
probe    probe_received  subject "Mermail readiness probe <date>-<suffix>"
         sender_authentication.status "pass"   scan_status "clean"
folders  <names as list_folders returned them>
monitor  monitoring_skipped
VERDICT  ready
next     mermail-agent-inbox
```

### "Is this mailbox ready for production work? Go/no-go with evidence."

Expected: reuse, no provisioning, and an honest downgrade when a check answers
`unknown`. `unknown` is not `pass` and never rounds up.

```
mailbox  support@<domain>  (public_id <id>)  reused
probe    probe_received
         sender_authentication.status "unknown"   scan_status "clean"
VERDICT  degraded — sender authentication returned unknown, not pass
next     mermail-manage-inbox
```

### "Run the round-trip self-test, but show me the test email before you send it."

Expected: the exact `from`, `to`, subject and body previewed, a stop for approval,
and — if approval does not arrive or the probe never lands inside the stated retry
cap — a `degraded` verdict with no second send.

```
preview  from <mailbox email>  to <same-workspace mailbox>
         subject "Mermail readiness probe <date>-<suffix>"
         body    "<self-test text>"
         waiting for approval — nothing sent
...
probe    probe_missing after <n> polls over <n>s (cap stated before starting)
VERDICT  degraded — delivery not observed inside the stated cap
```

### What the skill will not do

- Send a second probe, or extend a stated retry cap, without a new approval.
- Send to a recipient outside the workspace.
- Report a number, a domain status, or an authentication result the tools did not return.
- Continue into the next skill's work after handing off.
