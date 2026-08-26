# Security sentinel workflows

Four sequences. Every sequence starts from a resolved mailbox (`list_mailboxes`, `public_id` as `mailboxId`) and a user-supplied owner alert address.

## 1. Registry build (first run) and refresh

1. `search_emails` in bounded passes for enrollment evidence: subjects and senders shaped like "verify", "confirm your", "welcome to", "your account". Metadata first, `limit` <= 25 per pass, narrow date windows walking backward. On refresh, search only since the registry's last-updated date.
2. For each candidate, `get_email` (after `scan_status: clean`) only when metadata is insufficient to name the service and sender domain.
3. Reduce to one registry row per service: service name, expected registered domain(s), first-seen date, evidence message ids. Two services claiming one domain, or one service seen on two unrelated domains, is recorded as ambiguity for the user - not merged.
4. `save_draft` the registry as `Sentinel Registry` (plain-text table). Pass the prior draft id on refresh to update in place. No codes, links, or secrets in the registry body.
5. Report: services found, domains recorded, ambiguities, evidence counts.

## 2. Watch setup

1. `list_custom_labels`; create only what is missing.
2. `create_custom_label` `Security event`: description matching password resets, new sign-in or device alerts, MFA/two-factor changes, lockouts, and breach or incident notifications.
3. `create_custom_label` `Suspicious sender`: description matching security-shaped mail whose sender does not belong to an enrolled service's expected domains.
4. Optional, on explicit automation intent: `list_task_triagers`, then `create_task_triager` with classify-and-draft instructions - label the event, draft (never send) an owner alert. Verify with `list_recent_triager_runs` after the first arrivals. Never `set_default_task_triager`.

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

## Demo path (reproducible)

A working end-to-end check needs only an API key: build the registry from a mailbox holding two or three real signup verifications, set up the two labels, then send the mailbox (from any outside account) one genuine-looking security notice from an enrolled service's real domain and one lookalike (for example `service-security-alerts.com` claiming that service). Run sequence 3 on each: the first must come out `expected`, the second `suspicious`, and the approved owner alert must cite the domain comparison. Total runtime is a few minutes.
