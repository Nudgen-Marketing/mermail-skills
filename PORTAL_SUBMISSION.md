# OpenAI Plugins Directory — paste-ready Phase 3 pack

Portal docs: https://learn.chatgpt.com/docs/submit-plugins  
Platform (create submission): https://platform.openai.com/ (Apps / Plugins — need **Apps Management: Write**)

This file is the working checklist for Phase 3. Repo packaging is done in **1.3.0**; you still must complete OpenAI identity + portal submit (cannot be automated without your org login).

## A. OpenAI org (you, in browser)

1. Sign in to https://platform.openai.com with the Mermail publisher account.
2. Organization settings → verify **business** identity as **Mermail** / Nudgen Marketing (website `https://mermail.app`).
3. Roles → submitter role → **Apps Management = Write** → assign to yourself → reload portal.
4. Open plugin submission → **Create plugin** → type **With MCP** (app + skills).

## B. Listing (Info tab) — paste these

| Field | Value |
| --- | --- |
| Plugin name | Mermail |
| Short description | Privacy-first email for AI agents |
| Long description | Connect Mermail to ChatGPT and Codex to manage agent inboxes from chat. Search messages, read threads, draft and send mail with approval, organize folders and labels, and run task triage — scoped to your Mermail workspace. Perfect for catching up on threads, preparing replies, or keeping agent workflows on top of email. |
| Developer identity | Verified business: Mermail |
| Category | Productivity |
| Logo | `assets/logo.png` or `assets/icon.png` from mermail-skills |
| Screenshots | `assets/screenshot-1.png`, `assets/screenshot-2.png` |
| Website | https://mermail.app |
| Support | contact@mermail.app (or https://mermail.app) |
| Docs | https://docs.mermail.app/ai/skills |
| Privacy | https://mermail.app/privacy |
| Terms | https://mermail.app/terms |

## C. MCP tab

| Field | Value |
| --- | --- |
| MCP server URL | `https://console.mermail.app/mcp` |
| Transport | Streamable HTTP |
| Authentication | **OAuth** |
| Challenge Base URL | `https://console.mermail.app` (or parent `https://mermail.app` if you host the token there) |
| Demo credentials | Prefer OAuth: provide a reviewer Google account that can complete consent **without MFA/SMS**. Create a Mermail workspace + mailbox for that account. Optionally also provide a read-only `sk-proj-…` demo key if the form asks for API key fallback. |
| CSP | See below |

### Content security policy (CSP)

Mermail MCP is tools-only (no ChatGPT Apps SDK iframe UI). Use a minimal allowlist for the MCP host and brand assets:

```text
default-src 'none'; connect-src https://console.mermail.app https://mermail.app; img-src https://console.mermail.app https://mermail.app data:; style-src 'unsafe-inline';
```

If the portal requires a stricter JSON CSP field, paste:

```json
{
  "connect-src": ["https://console.mermail.app", "https://mermail.app"],
  "img-src": ["https://console.mermail.app", "https://mermail.app", "data:"]
}
```

### Domain challenge

1. Portal shows token → copy exact string.
2. Set console deploy env: `OPENAI_APPS_CHALLENGE_TOKEN=<token>` and redeploy.
3. Verify:

```bash
curl -fsSL https://console.mermail.app/.well-known/openai-apps-challenge
```

4. Click verify / Scan Tools in the portal.

Route already exists in mermail: `app/.well-known/openai-apps-challenge/route.ts`.

### Tool annotations

Production MCP already sets per tool:

- `readOnlyHint` for GET tools
- `destructiveHint` for destructive tools
- `openWorldHint` for send/invite/external writes

Scan Tools should pick these up from `https://console.mermail.app/mcp`.

## D. Skills tab

Upload ZIP built by:

```bash
./scripts/build-openai-skills-zip.sh
```

Output: `dist/mermail-skills-openai.zip` (skills tree + `.codex-plugin/plugin.json`; MCP/apps/screenshots excluded per portal rules).

Or point reviewers at public repo: `https://github.com/Nudgen-Marketing/mermail-skills`.

## E. Starter prompts (max 3 shown in product; portal may allow more)

1. Summarize unread Mermail messages and suggest next actions.
2. Draft a reply in Mermail and wait for my approval before sending.
3. Review Mermail API credits and mailbox triage status.

## F. Testing — 5 positive + 3 negative

### Positive 1 — List mailboxes

- **Prompt:** List my Mermail mailboxes and show email plus public_id.
- **Expected:** Calls `list_mailboxes`; returns mailbox list with `public_id` / email.
- **Account:** Reviewer OAuth workspace with ≥1 mailbox.

### Positive 2 — Search / list mail

- **Prompt:** Show the latest emails in my primary Mermail mailbox.
- **Expected:** Resolves mailbox via `public_id`, calls `list_emails` or `search_emails`.
- **Account:** Mailbox with sample messages.

### Positive 3 — Save draft (no send)

- **Prompt:** Save a Mermail draft to myself with subject “OpenAI review draft” and body “Hello from Mermail”.
- **Expected:** Calls `save_draft` with string field `body` (not html/text); does **not** call `send_email`.
- **Account:** Same mailbox; `from`/mailbox address valid.

### Positive 4 — Skill workflow

- **Prompt:** Use mermail-manage-inbox to summarize unread mail.
- **Expected:** Skill triggers read tools only (`list_mailboxes`, `list_emails` / `search_emails`); no send.
- **Account:** Unread sample mail optional.

### Positive 5 — Credits

- **Prompt:** Check my Mermail API credit usage for this workspace.
- **Expected:** Calls `list_workspaces` then `get_api_credit_usage` (or equivalent); returns usage numbers.
- **Account:** Any Developer-plan workspace.

### Negative 1 — Invalid send payload

- **Prompt:** Send an email from Mermail with no from address and no body.
- **Expected:** Refusal or tool `validation_failed` with `details`; message not sent.

### Negative 2 — Destructive without confirmation

- **Prompt:** Permanently delete all trash in my Mermail mailbox right now.
- **Expected:** Requires explicit approval + `prepare_destructive_action` token; does not empty trash on a vague prompt alone.

### Negative 3 — Auth / scope

- **Prompt:** (After disconnecting or with revoked key) List Mermail mailboxes.
- **Expected:** `401` / reconnect OAuth guidance; no data leak.

## G. Global / release notes

- **Availability:** Start with countries where Mermail ToS/privacy apply (at minimum US / global if already covered).
- **Release notes:**

```text
Initial public submission of Mermail as an MCP + skills plugin.
MCP: https://console.mermail.app/mcp (Streamable HTTP, OAuth).
Skills: 8 workflows (inbox, compose, triage, workspace, CLI/MCP helpers).
Reviewers: use OAuth consent on console.mermail.app; demo workspace prepared for <REVIEWER_EMAIL>.
```

## H. After approval

1. **Publish** from the portal.
2. Copy **connector id** → create `.app.json` from `.app.json.example` → set `"apps": "./.app.json"` in `.codex-plugin/plugin.json` → bump to **1.3.1** → push.
3. Verify Codex/ChatGPT Plugins → Mermail → **Apps Connected** + **Skills**.
4. Update `mcp-registry/directories.md` status to **Live**.

## I. What this agent cannot do without you

- Log into your OpenAI org / complete KYC
- Click Submit / Publish in the portal
- Receive the challenge token or connector id before the portal issues them

Once you paste the **challenge token** and (later) **connector id** here, the agent can set env instructions / commit `.app.json` immediately.
