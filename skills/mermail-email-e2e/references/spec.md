# Suite spec: `.mermail/email-e2e.json`

One JSON file describes every email flow. The agent writes it from the repository; humans review and commit it; the runner and the MCP-mode workflow both execute it. Start from [email-e2e.example.json](../templates/email-e2e.example.json).

## Top level

| Field | Required | Meaning |
| --- | --- | --- |
| `mailbox` | yes | Test mailbox email or `public_id`. Use `"{env:MERMAIL_E2E_MAILBOX}"` so CI can inject it. |
| `capture` | no | `inbox` (default): a separate test inbox receives the mail. `sent`: the app sends through this mailbox, so read the dispatched copy from Sent and wait for its provider receipt (`DLV-004`). Can be set per flow. |
| `appBaseUrl` | recommended | Base URL of the app under test, available as `{appBaseUrl}`. |
| `mode` | no | `dev` (default), `staging`, or `production`. `production` requires `MERMAIL_E2E_ALLOW_PRODUCTION=1`, and `http://` or local links fail outside `dev`. |
| `linkHosts` | recommended | Allowlist for link checks and link following: `host` (subdomains included) or exact `host:port`. Only hosts the user's app owns. |
| `plusAddressing` | no | `true` sends to `local+e2e-<runId>@domain`, one address per run. Hosted `@mermail.app` addresses do not deliver subaddresses, so use it only on a custom domain confirmed to support them. |
| `defaults` | no | `timeoutSec` (120), `pollSec` (8, minimum 5), `maxLatencySec` (30), `checkDuplicates` (true). |
| `rateLimitRpm` | no | MCP calls per minute the runner allows itself (default 6). The Free plan allows 10 per workspace, shared with the app's own sends and the agent's MCP calls. |
| `vars` | no | Extra template variables. |
| `reportDir` | no | Defaults to `email-e2e-report`. |

## Flow

| Field | Required | Meaning |
| --- | --- | --- |
| `id` | yes | Stable id used by `--flow`. |
| `title` | no | Human-readable name. |
| `kind` | no | `transactional` (default) or `marketing` (enables `CMP-001`). |
| `trigger` | yes | An action (below) that makes the app send the email to `{address}`. |
| `expect` | yes | Assertions on the received message (below). |
| `then` | no | Actions that complete the flow and assert on app state. They can use `{link}` and `{otp}`. |
| `address` | no | Override the recipient for this flow, for example a second plus-address. |
| `capture`, `timeoutSec`, `pollSec`, `checkDuplicates` | no | Per-flow overrides. |

## Actions (`trigger` and `then` steps)

```json
{ "http": { "method": "POST", "url": "{appBaseUrl}/api/signup", "json": { "email": "{address}" }, "headers": {}, "expectStatus": 201 } }
```

```json
{ "command": ["npm", "run", "seed:invite", "--", "{address}"], "cwd": "..", "timeoutSec": 60 }
```

Commands are argv arrays executed without a shell; there is no string form, so nothing is shell-interpolated. A trigger fails on HTTP ≥ 400 unless `expectStatus` says otherwise, or on a non-zero exit. `then` steps add `expectStatus`, `expectJson` (recursive subset match; `/regex/` strings allowed), `expectBodyContains`, and `title`.

## `expect`

| Field | Check | Meaning |
| --- | --- | --- |
| `from` | `HDR-001` | Exact sender address. |
| `subject` | `HDR-002` | Exact subject or `/regex/flags`. Plain strings also narrow the server-side search. |
| `contains` / `notContains` | `CNT-002` / `CNT-003` | Visible-text substrings or `/regex/`. |
| `requireText` | `CNT-004` | Make a missing text part a FAIL. |
| `maxLatencySec` | `DLV-002` | Per-flow latency budget. |
| `link.pattern` | `LNK-003` | Literal substring (or `/regex/`) identifying the CTA href. |
| `link.requireParams` | `LNK-004` | Query keys that must be present and populated. |
| `link.follow` | `LNK-006` | Follow the CTA once, allowlisted hops only. |
| `link.expectStatus`, `link.expectBodyContains` | `LNK-006` | What the landing page must return. |
| `otp.pattern` | `OTP-001` | `/regex/` for the code, for example `"/\\b\\d{6}\\b/"`. |

## Templating

`{address}` is the recipient each trigger should use: the flow's `address`, else the test mailbox's own address (with `capture: "sent"` the app sends to that address, so the provider receipt is real). Other variables: `{mailbox}`, `{appBaseUrl}`, `{runId}`, `{flowId}`, `{link}`, `{otp}`, any `vars` key, and `{env:NAME}`. Append `|url` to URL-encode (`{address|url}`). Unknown placeholders are left untouched, so a typo shows up in the request instead of disappearing silently.

## Ordering

Flows run in file order and share the run's address, so a later flow (password reset) can act on the account an earlier flow (signup) created. Each flow records its own baseline, which keeps the signup email from matching the reset flow.
