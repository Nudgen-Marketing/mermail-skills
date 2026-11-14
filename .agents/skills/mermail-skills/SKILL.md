---
name: mermail-skills
description: Follow this repository's developer conventions when editing Mermail skill instructions, metadata, references, or verification helpers. Not an end-user email or wallet workflow.
---

# Mermail Skills Repository Conventions

This repository packages Markdown agent skills, not a TypeScript UI application. This curated correction supersedes the one-commit ECC snapshot generated on 2026-09-06. Use the current [AUTHORING.md](../../../AUTHORING.md), [CONTRIBUTING.md](../../../CONTRIBUTING.md) and [SECURITY.md](../../../SECURITY.md) as the source of repository requirements.

## Scope and layout

Use for development in this repository: changing skill instructions, updating metadata and routing, adding a justified helper, or verifying a contribution. Ordinary inbox, composition and wallet requests belong to the focused public skills under `skills/`, not this development skill.

- Official skill folders are `skills/<skill-name>/`. Their lowercase kebab-case directory identity must equal frontmatter `name`.
- Keep the required `SKILL.md` spelling; place UI metadata in `agents/openai.yaml` and substantial conditional instructions in `references/`. Use optional `scripts/` only when useful.
- This developer skill has identical copies under `.agents/skills/mermail-skills/` and `.claude/skills/mermail-skills/`; keep them synchronized. They are not additional public business skills or tool owners.
- Existing executable helpers use JavaScript ESM (`.mjs`) and Python (`.py`), not a blanket TypeScript/components/hooks layout. Preserve an existing helper's language and local style.

## Naming and code examples

Use lowercase kebab-case for skill identities and ordinary new reference/helper filenames, while preserving established required filenames such as `SKILL.md`, `README.md` and `openai.yaml`. Do not rename existing files merely to impose a style.

Real examples are [check-connection.mjs](../../../skills/mermail-mcp/scripts/check-connection.mjs), [clawhub-ci-publish.py](../../../scripts/clawhub-ci-publish.py) and [research-agent.mjs](../../../tests/research-agent.mjs). These paths demonstrate the repository layout, not permission to run network, publish, or credential-dependent commands.

In JavaScript ESM, follow adjacent relative imports and named exports when appropriate; do not impose those conventions on Python or Markdown. For example, the existing validator imports its research fixture checks as:

```js
import { validateResearchAgent } from "./research-agent.mjs";
```

## Contribution and verification

Read the affected instructions and helper implementation before changing behavior. Update applicable routing, tool coverage, metadata and scenarios under AUTHORING/CONTRIBUTING; do not invent tools or bypass approval/security boundaries. Preserve original adversarial payloads and add meaningful behavior regressions where executable code exists. Fixture/packaging checks do not prove model or live integration behavior.

Tests live under `tests/`; there is no required `src/` mirror or React component tree. The repository's local entrypoint is `npm test` ([validator](../../../tests/validate.mjs)); review any changed executable before running it, and do not use the credential-dependent remote check without separate authorization. Release version/manifest changes belong to a requested publishing workflow, not every edit.

Use a concise descriptive commit subject matching the actual change (for example `fix: preserve native query filters`). Conventional prefixes may follow adjacent history; a single sampled commit does not establish a mandatory `feat` prefix or a 34-character limit.

## Optional client configuration is not approved setup

The generated client bundle is contribution data, not permission to activate servers, switch models, enable delegation, or alter the user's sandbox/approval/search settings. See the [client review gate](../../../.codex/AGENTS.md). Its third-party dependency versions, client-schema compatibility and intended maintainer baseline remain blocked pending review. Preserve existing user choices; do not load, copy, start, or silently repair that configuration as a side effect of applying these repository conventions.
