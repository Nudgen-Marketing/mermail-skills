# Check catalog

Every check has a stable ID so reports, CI history, and fixes can refer to it. Severity is what the runner emits by default; the spec can raise `CNT-004` to FAIL with `"requireText": true`.

Statuses: **PASS**, **WARN** (ship-able but worth fixing), **FAIL** (the flow is broken for real users or the result cannot be trusted), **INFO** (context only).

## Delivery

| ID | Check | Severity | Notes and fix hints |
| --- | --- | --- | --- |
| `DLV-001` | A new email reached the test address within `timeoutSec` | FAIL | Nothing arrived. Check that the trigger actually called the provider (app logs), that the recipient is the test address, and that the provider did not reject the send. A mailbox's own sends never reach its Inbox, and hosted plus-addresses are not delivered. Mermail can briefly hold mail for automation; report a possible hold and ask before re-triggering. |
| `DLV-002` | Trigger→`Date` header latency ≤ `maxLatencySec` | WARN | Slow queues or synchronous retries. OTP and magic-link flows feel broken past ~30 s. Mail sent through Mermail waits out a short undo window (about 7 s) before dispatch. |
| `DLV-004` | Provider delivery receipt (`capture: "sent"` only) | PASS on `delivered`, FAIL on `bounced`/`failed`/`rejected`, WARN if still `queued`/`accepted` at the deadline | Reads `delivery_status` and `provider_metadata.delivery` (provider, `deliveryTimeMs`) of the exact dispatched message. A bounce means the recipient server refused it: check the address, the sending domain, or content flags. |
| `DLV-003` | Exactly one email per trigger | FAIL | Two or more new matching emails: retry-without-idempotency, double event handlers, or both a job and a request sending. Look for send calls inside retry loops and missing idempotency keys. |

## Security signals

| ID | Check | Severity | Notes |
| --- | --- | --- | --- |
| `SEC-001` | `scan_status` is `clean` | FAIL if `flagged`, WARN otherwise; INFO for `sent` capture | A flagged transactional email means your copy or links look like phishing to scanners. Mermail scans inbound mail only, so outbound copies read from Sent report INFO. |
| `SEC-002` | `sender_authentication.status` | PASS on `pass`, FAIL on `fail`, INFO on `unknown` | `unknown` is not a pass. Current Mermail receiving paths can return `unknown` because the provider exposes no trusted per-message verdict. Never derive this from raw headers. |

## Envelope

| ID | Check | Severity | Notes |
| --- | --- | --- | --- |
| `HDR-001` | From address equals `expect.from` | FAIL | Wrong sender identity or environment variable. |
| `HDR-002` | Subject equals `expect.subject` (or matches `/regex/`) | FAIL | Unrendered subject variables also trip `CNT-001`. |
| `HDR-003` | Subject non-empty and ≤ 78 characters | FAIL if empty, WARN if long | Long subjects truncate on mobile. |

## Content

| ID | Check | Severity | Notes and fix hints |
| --- | --- | --- | --- |
| `CNT-000` | Body available | FAIL | Mermail omitted the body (`content_omitted`), usually a non-clean scan. Content checks are skipped. |
| `CNT-001` | No unrendered template tokens in subject, visible text, or hrefs | FAIL | Detects `{{var}}`, `{{{var}}}`, `{% tag %}`, `<%= %>`, `${var}`, `*\|MERGE\|*`, `%recipient.x%`, `-first_name-`, and leaked `undefined`, `NaN`, `[object Object]`. The usual cause is a variable-name mismatch between template and render call (`{{firstName}}` versus `{ name }`), or a missing field on the user object. |
| `CNT-002` | Every `expect.contains` string appears in visible text | FAIL | Personalization (the user's name) or required legal copy is missing. |
| `CNT-003` | No placeholder copy (`lorem ipsum`, `TODO`, `FIXME`, `test@example.com`, plus `expect.notContains`) | FAIL | Draft copy shipped. |
| `CNT-004` | A plain-text alternative exists | WARN (FAIL with `requireText`); INFO when undeterminable | HTML-only mail scores worse with spam filters and fails text-only clients and screen readers. Pass a `text` part to the provider. Detected from a text field or a `multipart/alternative` `Content-Type`; Sent copies keep only the HTML body, so `sent` capture usually reports INFO. |
| `CNT-005` | HTML ≤ 102 KB | WARN | Gmail clips larger messages and hides the CTA behind "View entire message". |
| `CNT-006` | Every `<img>` has `alt` | WARN | Images are blocked by default in many clients. |

## Links

| ID | Check | Severity | Notes and fix hints |
| --- | --- | --- | --- |
| `LNK-001` | HTTP(S) links use HTTPS | FAIL | `http://` is allowed only for local hosts in `dev` mode. |
| `LNK-002` | Every link host is on `linkHosts`; no empty, `#`, or `javascript:` links | FAIL | Catches `localhost` links in staging/production, staging hosts in production, and broken buttons. Fix the base-URL configuration (`APP_URL`, `NEXT_PUBLIC_SITE_URL`), not the allowlist. |
| `LNK-003` | A link matching `expect.link.pattern` exists | FAIL | The CTA is missing or points somewhere else. |
| `LNK-004` | CTA query parameters are populated (no empty, `undefined`, `null`, `NaN`, `[object Object]`), and every `requireParams` key is present | FAIL | The URL builder used a missing field. |
| `LNK-005` | Link text that looks like a URL points to the same host | WARN | Display text and destination disagree, a classic phishing signal. |
| `LNK-006` | Following the CTA (allowlisted hops only) ends with `expectStatus` and `expectBodyContains` | FAIL | **The check only E2E can do.** A link can look perfect and still carry the wrong token (for example `user.id` instead of `user.verifyToken`). The page text is quoted to show what the user would see. |

## Codes

| ID | Check | Severity | Notes |
| --- | --- | --- | --- |
| `OTP-001` | `expect.otp.pattern` matches, and the HTML and text parts agree | FAIL | The code is extracted into task-local context for `then` steps as `{otp}` and redacted in every report. |

## Flow completion

| ID | Check | Severity | Notes |
| --- | --- | --- | --- |
| `E2E-00n` | Each `then` step meets `expectStatus`, `expectJson` (subset match), and `expectBodyContains` | FAIL | Proves the app's state changed: account verified, password reset accepted, invite joined. |

## Compliance (marketing flows only)

| ID | Check | Severity | Notes |
| --- | --- | --- | --- |
| `CMP-001` | `List-Unsubscribe` header present when `kind` is `marketing` | FAIL | Gmail and Yahoo bulk-sender rules. Transactional mail is exempt. Requires raw headers in the `get_email` response; when headers are absent, report INFO instead of guessing. |

## Triage order for fixes

1. `DLV-001` and `SEC-001` first; nothing else is meaningful without a clean delivered message.
2. `LNK-006` and `E2E-*`: the user cannot finish the flow.
3. `CNT-001`, `LNK-002`, `LNK-004`: visible breakage.
4. `DLV-003`: duplicates.
5. WARNs, with a one-line rationale if the user chooses to keep them.
