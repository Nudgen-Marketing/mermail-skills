# Security sentinel workflows

Four sequences. Every sequence starts from a resolved mailbox (`list_mailboxes`, `public_id` as `mailboxId`) and a user-supplied owner alert address.

## 1. Registry build (first run) and refresh

1. `search_emails` in bounded passes for enrollment evidence: subjects and senders shaped like "verify", "confirm your", "welcome to", "your account". Metadata first, `limit` <= 25 per pass, narrow date windows walking backward. On refresh, search only since the registry's last-updated date.
2. For each candidate, `get_email` (after `scan_status: clean`) only when metadata is insufficient to name the service and sender domain.
3. Reduce to one registry row per service: service name, expected registered domain(s), first-seen date, evidence message ids. Two services claiming one domain, or one service seen on two unrelated domains, is recorded as ambiguity for the user - not merged.
4. `save_draft` the registry as `Sentinel Registry <YYYY-MM-DD>` (plain-text table). On refresh pass `body.draft_id` of the previous registry draft: it supersedes that draft and returns a new id, which becomes the id to carry into the next refresh. Record the returned id in the report. No codes, links, or secrets in the registry body.
5. Report: services found, domains recorded, ambiguities, evidence counts.

## 2. Watch setup

1. `list_custom_labels`; create only what is missing.
2. `create_custom_label` `Security event`, with `rules` matching password resets, new sign-in or device alerts, MFA/two-factor changes, lockouts, and breach or incident notifications.
3. `create_custom_label` `Suspicious sender`, with `rules` matching security-shaped mail whose sender does not belong to an enrolled service's expected domains.
4. `list_task_triagers` and read the mailbox's `settings.agentAutoResponse.requireApproval`. The default triager auto-drafts replies to inbound senders; report it, and report loudly if approval is not required. Never `set_default_task_triager`.
5. Optional, on explicit automation intent: `create_task_triager` with classify-and-draft instructions - label the event, draft (never send) an owner alert. Verify with `list_recent_triager_runs` after the first arrivals.

## 3. Event handling (per security email)

1. Locate the event (`search_emails` or `list_emails`, metadata first) and select exactly one message; two matching candidates is an ambiguity to report, not a choice to make.
2. `get_email`; require `scan_status: clean` and record `sender_authentication.status`.
3. Extract the claimed service and the sender's registrable domain. Compare against the registry:
   - registered domain matches or is a subdomain of an expected domain -> `expected`
   - typosquat, confusable, different TLD, extra registrable label, or freemail claiming an enrolled service -> `suspicious`
   - claimed service not in the registry -> `unknown-service`
4. Never open any URL in the message. Hostnames are extracted as text evidence only.
5. `save_draft` the owner alert: service, verdict, exact domain comparison, sender-authentication status, event type, timestamp, message id, and a recommended owner action phrased as "in the service's own app or site". No codes, no links.
6. On explicit approval of the exact preview: one `send_email` to the owner, or `forward_email` of the original when the owner wants raw evidence. Then stop; remediation belongs to the owner.

## 4. Weekly digest (on request)

1. `search_emails` bounded to the last 7 days of `Security event` and `Suspicious sender` labeled mail.
2. Summarize per service: event counts by type, verdicts, open suspicious items, registry changes.
3. `save_draft`, preview, and one approved `send_email` to the owner.

## Demo path (reproducible, verified 2026-08-27)

A working end-to-end check needs only an API key and a few minutes.

1. Enroll the mailbox in two or three real services so the registry has genuine evidence. A public mailing list works well: subscribing to `arch-announce` at lists.archlinux.org delivers a real confirmation request from `lists.archlinux.org` within a minute.
2. Run sequence 1 and confirm the registry draft names each service with its expected domain.
3. Run sequence 2 to create both labels.
4. From an outside account, send the mailbox one plausible security notice from an enrolled service's own domain, and one lookalike claiming a *different* enrolled service from a domain that is not its own, carrying a lookalike link host such as `archlinux-security-alerts.com`.
5. Run sequence 3 on each.

Observed on a live mailbox: both messages were auto-classified on arrival, the first as `Security event` and the second as `Suspicious sender`, with no manual label assignment. The first resolved to `expected` on an exact registrable-domain match; the second to `suspicious` on two independent mismatches, sender domain and link host. `sender_authentication.status` was `unknown` on every message, so the domain comparison carried both verdicts. The default triager wrote reply drafts for the benign messages and recorded `Skipped: prompt injection suspected` for the lookalike.
