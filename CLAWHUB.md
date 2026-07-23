# Publish Mermail skills to ClawHub

[ClawHub](https://clawhub.ai/) is the OpenClaw public registry for **skills** (`SKILL.md`) and plugins. Mermail publishes the nine workflow skills from this repo under the publisher handle **`mermail`**.

Remote MCP stays separate: configure it with `openclaw mcp set` (see below). ClawHub lists the skill packs; it does not replace Official MCP Registry (`app.mermail/mcp`).

## Prerequisites

- GitHub account at least one week old (ClawHub auth requirement)
- Node.js 20+
- Publisher access to the ClawHub owner handle `mermail` (create the org at [clawhub.ai](https://clawhub.ai/) if needed)

```bash
npm i -g clawhub
clawhub login
clawhub whoami
```

Org-owned GitHub repos cannot use the web “import from GitHub” flow for a personal account. Publish from a local clone with the CLI (this repo: `Nudgen-Marketing/mermail-skills`).

## Dry-run then live publish

From the repo root:

```bash
# Preview all nine skills (default)
./scripts/publish-clawhub.sh

# Upload
CLAWHUB_LIVE=1 ./scripts/publish-clawhub.sh
```

Or publish one skill:

```bash
clawhub skill publish ./skills/mermail-compose-email \
  --slug mermail-compose-email \
  --name "Mermail Compose Email" \
  --owner mermail \
  --version "$(node -p "require('./package.json').version")" \
  --dry-run
```

Omit `--dry-run` (or set `CLAWHUB_LIVE=1` on the script) for a real upload.

## Install after publish

```bash
clawhub install mermail/mermail-compose-email
# or browse: https://clawhub.ai/mermail/mermail-compose-email
```

OpenClaw users can also install via native skill commands once listed.

Keep MCP connected:

```bash
openclaw mcp set mermail '{"url":"https://console.mermail.app/mcp","transport":"streamable-http","headers":{"x-api-key":"'"$MERMAIL_API_KEY"'"}}'
openclaw mcp doctor mermail --probe
```

## CI (optional)

After creating a ClawHub token and storing it as `CLAWHUB_TOKEN` in GitHub Actions secrets, the workflow `.github/workflows/clawhub-skill-publish.yml` publishes on `main` / tags using OpenClaw’s reusable `skill-publish.yml`.

## License note

ClawHub licenses published skills as **MIT-0** (registry policy). This repository’s `LICENSE` remains MIT. Do not add conflicting per-skill license text.
