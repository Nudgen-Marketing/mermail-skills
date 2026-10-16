# Workflows

## First run in a new repository

1. `list_workspaces({})` → `list_mailboxes({})`. Pick or (with approval) provision the test mailbox.
2. Find send call sites and templates:
   ```bash
   rg -n "sendEmail|sendMail|resend\.emails|postmark|sgMail|nodemailer|/emails" --glob '!node_modules' .
   rg --files | rg -i '(emails?|templates?)/|\.(mjml|hbs|handlebars|liquid|njk|ejs)$'
   ```
3. For each flow, read the route that triggers it and the template it renders. Note the variables passed to the renderer and the variables the template uses; mismatches are the top cause of `CNT-001`.
4. Write `.mermail/email-e2e.json` (see [spec.md](spec.md)) with one flow per email type. Prefer an HTTP trigger that the app already exposes. Add a `then` post-condition for every flow that has one.
5. Probe `appBaseUrl`. If the app is down, ask to start it, preferably in watch mode.
6. Run the suite (runner or MCP mode), then report.

## Fix loop

```
run → FAIL list → locate source → minimal diff → (watch reload) → re-run failed flows → full run
```

| Failure | Where to look | Typical fix |
| --- | --- | --- |
| `CNT-001` `{{firstName}}` | Template versus render arguments | Rename the template variable, or pass the field the template expects |
| `LNK-004` `token=undefined` | URL builder | Use the field that exists on the object |
| `LNK-006` HTTP 400/404 after the click | URL builder versus the verify handler | Build the link from the same value the handler looks up (for example `verifyToken`, not `id`) |
| `LNK-002` `localhost` in staging | Base-URL environment variable | Read `APP_URL` from the environment; do not hard-code it |
| `CNT-004` HTML only | Send call | Render and pass a `text` part |
| `DLV-003` duplicates | Retry wrappers, event handlers | Add an idempotency key; send once per event |
| `OTP-001` mismatch | Code generation versus storage | Store the same value you email; compare as strings |

Re-run with `--flow <id>` first, then the full suite once, so the final report covers everything.

## MCP mode

Use this when the host is connected with OAuth and `MERMAIL_API_KEY` is not in the shell environment. The steps match the runner:

1. **Baseline**: `list_emails` with the capture folder (`inbox`, or `sent` for sender-side capture), `metadata_only: true`, newest first, `limit` 50. Record the ids.
2. **Trigger**: run the flow's HTTP request (for example with `curl`) or argv command. Note the trigger time.
3. **Wait**: `search_emails` with `folder`, `to`, `subject`, `date_start` = trigger time minus 60 s, `metadata_only: true`, `include_held: true`. Poll every 8 s or slower, up to the flow deadline. Filter out baseline ids and items from other folders, and require the exact recipient and subject.
4. **Duplicate check**: when one candidate appears, search once more after 8 s.
5. **Read**: `get_email` with `max_body_chars: 100000`, plus `require_scan_status: "clean"` for inbox capture. For sent capture, re-read with `metadata_only: true` until the delivery receipt is final (`DLV-004`).
6. **Evaluate**: apply [checks.md](checks.md) in order. Extract links from `<a href>` and bare URLs, and the OTP with the spec's pattern.
7. **Complete**: follow the CTA once if it is allowlisted, then run the `then` steps with the extracted `{link}` or `{otp}`.
8. **Report**: one table per flow with IDs, statuses, and redacted evidence.

## CI

1. Vendor the runner: copy `scripts/run-email-e2e.mjs` and `scripts/checks.mjs` into `.mermail/`.
2. Add [github-action.yml](../templates/github-action.yml) as `.github/workflows/email-e2e.yml`, adjusting how the app starts.
3. Repository settings: create an `email-e2e` environment holding the `MERMAIL_API_KEY` secret, with required reviewers so code from a pull request cannot use the key without approval; set the variable `MERMAIL_E2E_MAILBOX`. The template passes the key only to the steps that need it (never to `npm ci`) and skips fork pull requests.
4. Keep `concurrency` at one run per test inbox, or enable `plusAddressing` so parallel runs use distinct addresses.
5. JUnit output (`email-e2e-report/junit.xml`) plugs into test reporters; `report.md` reads well as a job summary (`cat email-e2e-report/report.md >> $GITHUB_STEP_SUMMARY`).

## Choosing a capture mode

| Your setup | Capture | Why |
| --- | --- | --- |
| App sends through its own provider (Resend, Postmark, SES, SMTP, Firebase Auth, …) | `inbox` | The Mermail test inbox proves arrival end to end. |
| App sends through Mermail from mailbox A; you can read a different mailbox B | `inbox` (B) | Strongest signal: real cross-mailbox delivery. |
| App sends through Mermail and you have one mailbox (Free plan) | `sent` | Mermail never files a mailbox's own sends into its Inbox. The Sent copy is the exact message dispatched, and `DLV-004` carries the provider receipt. |

## Choosing a test mailbox

- Dedicated beats shared: use an E2E mailbox in verification mode so triage automations never touch test mail.
- The test inbox must differ from the app's sending mailbox. Mermail files a mailbox's own sends only under Sent, so a self-addressed test never arrives. When the app itself sends through Mermail on the Free plan (one mailbox per workspace), give the app its sender mailbox in one workspace and the test inbox in another.
- Plus-addressing (`plusAddressing: true`) gives each run `local+e2e-<runId>@domain` for unambiguous concurrent runs, but hosted `@mermail.app` addresses do not deliver subaddresses. Enable it only on a custom domain after one confirmed run.
