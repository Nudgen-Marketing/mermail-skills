# Publish Mermail skills to ClawHub

[ClawHub](https://clawhub.ai/) is the OpenClaw public registry for **skills** (`SKILL.md`) and plugins. Mermail publishes the fifteen workflow skills from this repo under the publisher handle **`mermail`**.

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
# Preview all fifteen skills (default)
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
openclaw mcp set mermail '{"url":"https://console.mermail.app/mcp","transport":"streamable-http","headers":{"x-api\u002dkey":"'"$MERMAIL_API_KEY"'"}}'
openclaw mcp doctor mermail --probe
```

## CI

The repo now has two ClawHub workflows:

- [`.github/workflows/clawhub-skill-publish.yml`](./.github/workflows/clawhub-skill-publish.yml) publishes the individual `skills/*` folders.
- [`.github/workflows/clawhub-package-publish.yml`](./.github/workflows/clawhub-package-publish.yml) publishes the repo as an OpenClaw bundle plugin package.

The package workflow follows OpenClaw's official reusable `package-publish.yml` path, pinned to the audited `v0.12.0` commit. Pull requests run a dry-run only; tag pushes and manual dispatches are the trusted release events. Before calling the reusable publish job, CI runs `clawhub package validate . --json` locally, only allows manual dispatches from `main` or a `vX.Y.Z` tag, and requires any `vX.Y.Z` tag to match `package.json` exactly.

### Package publish setup

OpenClaw's trusted publisher flow requires a one-time bootstrap before secretless GitHub OIDC publishes work:

```bash
# One-time package creation
clawhub package publish . --owner mermail

# Then bind GitHub Actions trusted publishing to the workflow
clawhub package trusted-publisher set mermail-skills \
  --repository Nudgen-Marketing/mermail-skills \
  --workflow-filename clawhub-package-publish.yml \
  --environment clawhub
```

Store `CLAWHUB_TOKEN` as a secret on the protected GitHub `clawhub` environment, not as a broad repository secret. Until that trusted publisher config exists, live package publishes need that token. Once trusted publishing is configured, manual `workflow_dispatch` publishes from `main` can use OIDC without that secret; ClawHub still requires `CLAWHUB_TOKEN` for tag-triggered publishes.

### Skill publish setup

After creating a ClawHub token and storing it as `CLAWHUB_TOKEN` on the protected GitHub `clawhub` environment, [`.github/workflows/clawhub-skill-publish.yml`](./.github/workflows/clawhub-skill-publish.yml) publishes on `main` / tags. Pull requests against `skills/**` run a separate dry-run job with no environment secret access. Live publishes only run from `main`, `vX.Y.Z` tags, or a manual dispatch from one of those refs; tag pushes whose `vX.Y.Z` tag does not match `package.json` are rejected.

The job installs pinned `clawhub@0.23.3` and runs [`scripts/clawhub-ci-publish.py`](./scripts/clawhub-ci-publish.py). That wrapper treats CLI statuses `published`, `unchanged`, `would-publish`, `pending-publication`, and `submitted` as success. `pending-publication` means ClawHub accepted the upload and is still running security scans; the skill becomes public after those finish. Do not use OpenClaw’s reusable `skill-publish.yml@main` — it treats `pending-publication` as a parse error and fails the job after a successful upload.

Live publishes need the `CLAWHUB_TOKEN` environment secret. Dry-run PR checks do not.

## License note

ClawHub licenses published skills as **MIT-0** (registry policy). This repository’s `LICENSE` remains MIT. Do not add conflicting per-skill license text.
