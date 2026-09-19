# CI failure-mode evidence — mermail-base-usdc-invoice

Repo CI (`.github/workflows/validate.yml`) runs `npm test` → `node tests/validate.mjs` on every PR/push. Captured below from **real local runs** on this fork (2026-09-19 CEST) while iterating on PR#320 — not invented logs.

## Healthy baseline (this PR skill set)

```text
$ node tests/validate.mjs
Validated 18 skills and 71 business tools.
(exit 0)
```

`compatibility.json` → `catalog.skills` must be `18`. `tool-coverage.json` → `infrastructureSkills` must include `mermail-base-usdc-invoice`.

## Failure matrix (local reproduce → CI symptom)

| Intentional break | Validator output (verbatim) | Fix |
| --- | --- | --- |
| Skill dir present but missing from `tool-coverage.json` `infrastructureSkills` | `ERROR: skills mismatch: expected …; found …mermail-base-usdc-invoice…` | Add `"mermail-base-usdc-invoice"` to `infrastructureSkills` (sorted with peers) |
| `compatibility.json` `catalog.skills` left at 17 after adding the skill | `ERROR: compatibility skill count must be 18` | Set `catalog.skills` to the directory count (18) |
| `TODO` left in `SKILL.md` | `ERROR: mermail-base-usdc-invoice: unresolved TODO` | Remove TODO; put unfinished notes outside the skill package |
| Frontmatter `name:` ≠ directory | `ERROR: mermail-base-usdc-invoice: name must match directory` | `name: mermail-base-usdc-invoice` |
| `metadata.openclaw.primaryEnv` not `MERMAIL_API_KEY` | `ERROR: mermail-base-usdc-invoice: metadata.openclaw.primaryEnv must be MERMAIL_API_KEY` | Restore `primaryEnv: MERMAIL_API_KEY` and `- MERMAIL_API_KEY` under `requires.env` |
| `agents/openai.yaml` `default_prompt` missing `Use $mermail-base-usdc-invoice` | `ERROR: mermail-base-usdc-invoice: openai.yaml missing default_prompt: "Use $mermail-base-usdc-invoice` | Keep the `$skill-id` token exactly |
| `agents/openai.yaml` MCP URL ≠ `tool-coverage.json` `mcpEndpoint` | `ERROR: mermail-base-usdc-invoice: openai.yaml missing url: "https://console.mermail.app/mcp"` | Use hosted URL `https://console.mermail.app/mcp` |

Reproduce any row: apply the break, run `node tests/validate.mjs` (expect exit 1 + `ERROR:` lines), restore, re-run until exit 0.

## Related CI workflows (same repo)

| Workflow | Trigger | Common fail mode |
| --- | --- | --- |
| `validate.yml` | PR / push main / schedule | `npm test` fails → gate red; scheduled `validate:remote` needs `MERMAIL_MCP_TEST_API_KEY` secret |
| `clawhub-package-publish.yml` | Plugin/manifest path PRs | `npm test` then `clawhub package validate .` — metadata drift vs `openclaw.plugin.json` |
| `clawhub-skill-publish.yml` | `skills/**` PRs | Skill publish dry-run / validate job fails if package layout or skill frontmatter invalid |

## Authoring checklist before push

1. `node tests/validate.mjs` → `Validated 18 skills…` (or current N ≥ 18 if more skills land).
2. `SKILL.md` links every reference you ship (`tools`, `security`, `workflows`, `examples`, `harness`, `harness-compat`, `harness-audit`, `harness-compatibility`, `harness-compatibility-fixtures`, `ci-failures`, `discussion-triage`, `discussion-triage-fixtures`, `pr-salvage`, `pr-salvage-corpus`, `pr-salvage-review-corpus`, `pr-salvage-review-fixtures`, `analyzer-fixtures`, `evaluator-rag-fixtures`).
3. No secrets in references; no fake CI logs — only failures you can re-run locally.
4. Do not bump `catalog.skills` without a matching `skills/` directory entry (and vice versa).
