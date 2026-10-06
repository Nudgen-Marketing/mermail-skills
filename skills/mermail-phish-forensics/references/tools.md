# Tool mapping — mermail-phish-forensics

Exact Mermail MCP tools used by this skill. Pass `query`/`body` as native
JSON objects, never stringified. Prefer mailbox `public_id` as `mailboxId`.
Use bare tool names (or the host's `Mermail:` prefix convention) — never
invent a prefix.

## Discovery

| Goal | Tool | Key params |
|---|---|
| List mailboxes | `list_mailboxes` | — |
| Resolve one mailbox | `get_mailbox` | `mailboxId` |
| Recent mail | `list_emails` | `mailboxId`, `limit`, `unreadOnly` |
| Keyword sweep | `search_emails` | `mailboxId`, `query` (e.g. `suspended OR verify OR invoice OR urgent`) |

## Evidence collection

| Goal | Tool | Key params |
|---|---|
| Full message + headers | `get_email` | `emailId` (or `messageId`); request headers |
| Thread context | `get_thread` | `threadId` — check for reply-chain hijack |
| Attachment names only | `get_email` | read `attachments[].filename`; **do not** `download_attachment` on suspects |

## Signal checklist (what to look for in the evidence)

**HEADERS**
- `From` display name vs address domain (e.g. `"PayPal Security" <x@other.example>`)
- `Return-Path` domain vs `From` domain
- `Reply-To` pointing somewhere unexpected
- `Authentication-Results`: spf/dkim/dmarc `fail` or `none`

**LINKS** (from body text or HTML hrefs — inspect, never visit)
- Displayed text (`paypal.com`) vs href target (`http://192.0.2.44/...`)
- Lookalike / typosquat domains (`paypa1-`, `micorsoft-`, `-secure`, `-verify` affixes)
- URL shorteners hiding the destination
- Bare IP literals, non-HTTPS credential forms

**ATTACHMENTS**
- Double extensions: `invoice.pdf.exe`, `statement.html`
- Executables / scripts: `.exe`, `.scr`, `.js`, `.vbs`, `.ps1`
- Macro documents: `.docm`, `.xlsm`

**LANGUAGE**
- Urgency + threat: "within 24 hours", "account suspended", "legal action"
- Secrecy: "do not contact your bank", "keep this confidential"
- Too-good-to-be-true: unexpected refunds, prizes, crypto doublers
- Authority impersonation: CEO/bank/government voice demanding wire action

**BRAND**
- Known brand (bank, wallet, carrier, employer) sent from an unrelated domain

## Scoring

- **PHISHING**: ≥2 independent signals, or 1 decisive technical signal
  (e.g. credential-harvest link on an unrelated domain).
- **SUSPICIOUS**: exactly 1 signal, or an off-pattern with a plausible
  explanation (first-time vendor, rebranded domain).
- **LEGITIMATE**: no signals. Note which checks passed.

## Actions (all approval-gated)

| Goal | Tool | Notes |
|---|---|
| Quarantine | `move_email` / `create_folder` | Move to `Quarantine`, then `mark` read |
| Remove | `delete_email` | Needs `prepare_destructive_action` token |
| Warn the user | `send_email` | Send the verdict report to the owner; preview exact body first |

Never `reply_to_email` the suspect sender. Never click through.
