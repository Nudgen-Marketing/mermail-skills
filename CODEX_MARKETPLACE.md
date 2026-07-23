# OpenAI / Codex Plugins Directory submission

Goal: Mermail appears in ChatGPT Work mode and Codex **Plugins** like Linear — **Apps Connected** (OAuth) + **Skills**.

**Phase 3 working pack (paste-ready form + test cases):** [PORTAL_SUBMISSION.md](./PORTAL_SUBMISSION.md)

GitHub install (`codex plugin marketplace add …`) is **not** the Official Plugins Directory. Directory listing requires OpenAI review + publish.

Submit portal: https://learn.chatgpt.com/docs/submit-plugins  
Build reference: https://developers.openai.com/codex/plugins/build
Platform: https://platform.openai.com/ (Apps Management: Write)

## Submission type

**With MCP** (app + skills) — closest to Linear.

| Field | Value |
| --- | --- |
| MCP URL | `https://console.mermail.app/mcp` |
| Transport | Streamable HTTP |
| Auth | **OAuth 2.1** (preferred for Apps Connected) |
| Skills | This repo (`skills/`, 9 workflows) or `npm run build:openai-zip` (ZIP with skill roots at top level) |
| Homepage | https://mermail.app |
| Docs | https://docs.mermail.app/ai/skills |
| Privacy | https://mermail.app/privacy |
| Terms | https://mermail.app/terms |
| Support | contact@mermail.app |

## Pre-flight (repo)

- [x] `.codex-plugin/plugin.json` with skills, MCP path, interface metadata, screenshots
- [x] `.codex-plugin/mcp.json` — GitHub/Codex path uses `MERMAIL_API_KEY` → `x-api-key`
- [x] Screenshots under `./assets/screenshot-*.png`
- [x] Console route `/.well-known/openai-apps-challenge` (set `OPENAI_APPS_CHALLENGE_TOKEN` when portal shows the challenge)
- [ ] OpenAI org **verified** + Apps / plugin submit permission
- [ ] Demo reviewer account or OAuth test mailbox ready
- [ ] 5 positive + 3 negative test cases prepared (see below)
- [ ] After portal assigns **connector id**: copy [`.app.json.example`](./.app.json.example) → `.app.json`, fill `id`, add `"apps": "./.app.json"` to `.codex-plugin/plugin.json`, bump patch version

Do **not** invent a connector id. OpenAI issues it when the MCP app is registered.

## Domain verification

1. In the submission portal, copy the challenge token.
2. Set console env `OPENAI_APPS_CHALLENGE_TOKEN=<exact token>` and redeploy.
3. Confirm:

```bash
curl -fsSL https://console.mermail.app/.well-known/openai-apps-challenge
```

Must return the exact token (plain text).

## Portal steps

1. Open the plugin submission portal → **Create plugin**.
2. Choose **With MCP** (includes skills).
3. Enter MCP URL `https://console.mermail.app/mcp`, auth **OAuth**, **Scan Tools**.
4. Complete domain verification if prompted.
5. Attach skills (repo or ZIP), listing copy, screenshots/logo.
6. Provide demo credentials / OAuth path for reviewers.
7. Submit → wait for approval → **Publish**.
8. Copy connector id → commit `.app.json` (see example) → push.

## Suggested test cases

**Positive**

1. List mailboxes (`list_mailboxes`) after Connect.
2. Search or list emails in one mailbox.
3. Save a draft (do not send) with string `body`.
4. Summarize unread with skill `mermail-manage-inbox`.
5. Check API credit usage for the workspace.

**Negative**

1. Send without approval / missing `from` → expect `validation_failed`.
2. Destructive delete without `prepare_destructive_action` token → rejected.
3. Wrong workspace / revoked auth → `401` / `403`.

## GitHub install (still supported)

Until Directory publish (and for automation):

```bash
export MERMAIL_API_KEY="sk-proj-YOUR_KEY"
codex plugin marketplace add Nudgen-Marketing/mermail-skills
codex plugin add mermail@mermail
```

Restart Codex, run `/mcp`, then try `list_mailboxes`.

## Local smoke

```bash
npm test
export MERMAIL_API_KEY="sk-proj-YOUR_KEY"
# optional: npm run validate:remote
```

## After Directory publish

1. In Codex / ChatGPT Plugins → Mermail → confirm **Apps Connected** + **Skills**.
2. Update landing `/agents` and docs to prefer Directory install (see mermail repo `agents-connect.ts`).
3. Track status in mermail `mcp-registry/directories.md`.

## Auth matrix

| Path | Auth |
| --- | --- |
| Official Plugins Directory (Apps) | OAuth Connected |
| GitHub `codex plugin add` | `MERMAIL_API_KEY` → `x-api-key` |
| ChatGPT custom connector | OAuth (already live) |
