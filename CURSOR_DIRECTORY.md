# Cursor Directory submission checklist

`cursor.directory` is the community plugin directory for Cursor. As of August 25, 2026, the official submission flow is still web-based: sign in, paste the GitHub repository URL, and submit from <https://cursor.directory/plugins/new>.

This repository is wired so GitHub Actions can keep that submission surface ready on every PR, `main` push, and release tag through [`.github/workflows/cursor-directory.yml`](./.github/workflows/cursor-directory.yml).

## Submit URL

https://cursor.directory/plugins/new

Repository to paste:

```text
https://github.com/Nudgen-Marketing/mermail-skills
```

## What Cursor Directory detects

Per Cursor's public `community-plugins` repository, the directory auto-detects:

- `skills/*/SKILL.md`
- `.mcp.json`

This repo also keeps Cursor-specific plugin metadata in:

- [`.cursor-plugin/plugin.json`](./.cursor-plugin/plugin.json)
- [`.cursor-plugin/mcp.json`](./.cursor-plugin/mcp.json)

Use the repo URL submission flow so the directory can ingest the full plugin/skills surface from the canonical source repo.

## Pre-flight

- [x] Public GitHub repository
- [x] Root MCP descriptor at [`.mcp.json`](./.mcp.json)
- [x] Cursor plugin manifest at [`.cursor-plugin/plugin.json`](./.cursor-plugin/plugin.json)
- [x] Cursor MCP manifest at [`.cursor-plugin/mcp.json`](./.cursor-plugin/mcp.json)
- [x] Skills published from `skills/*/SKILL.md`
- [x] README documents install and auth
- [x] CI readiness workflow at [`.github/workflows/cursor-directory.yml`](./.github/workflows/cursor-directory.yml)
- [ ] Sign in and submit the repository URL
- [ ] Wait for directory review/indexing

## GitHub Actions behavior

The readiness workflow does three things:

1. Runs `npm test` so the repo-level marketplace and manifest checks stay green.
2. Verifies the exact files Cursor Directory expects are present.
3. Writes a workflow summary with the manual submission URL and the canonical repository URL.

That is the maximum safe automation currently available from Cursor's published flow. There is no documented repository-side API or GitHub Action endpoint for unattended publication.

## Local smoke test

```bash
npm test
ln -sfn "$(pwd)" ~/.cursor/plugins/local/mermail
```

Then in Cursor: reload the window, open MCP tools, authenticate with Mermail OAuth, and confirm `mermail` appears and a read-only tool works.

## References

- <https://cursor.directory/plugins/new>
- <https://github.com/cursor/community-plugins>
- <https://github.com/cursor/plugins>
