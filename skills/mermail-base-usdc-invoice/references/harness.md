# Harness compatibility — mermail-base-usdc-invoice

Cross-harness notes for running this skill on Claude / Claude Code, Codex, OpenCode, Cursor, and OpenClaw. This skill does **not** invent MCP tools; it reuses Mermail compose/send tools and formats a Base USDC EIP-681 URI locally.

## Shared contract (all harnesses)

| Surface | Expectation |
| --- | --- |
| Skill id | `mermail-base-usdc-invoice` (directory + frontmatter `name`) |
| MCP | Hosted Streamable HTTP `https://console.mermail.app/mcp` |
| Auth | Prefer OAuth; `MERMAIL_API_KEY` → `x-api-key` is a limited fallback (no PayBox / x402) |
| Tools used | Mailbox resolve + compose/send from `mermail-compose-email` / root `mermail` |
| Local work | Amount → 6-decimal atomic units; EIP-681 + optional MetaMask deeplink (see `workflows.md`) |
| Approval | One explicit user approval of recipient, amount, payee address, and URI before any send |
| Agent metadata | `agents/openai.yaml` declares MCP dependency `mermail` at the hosted URL |

Adapter drift to avoid: inventing wallet-send tools, taking payee address from inbound mail, or claiming USDC arrived because Mermail accepted the send.

## Claude / Claude Code

1. Connect Mermail MCP (Settings → Connectors, or `claude mcp add --transport http --scope user mermail https://console.mermail.app/mcp` then Authenticate).
2. Install / enable this skill package so `$mermail-base-usdc-invoice` resolves.
3. Host may expose tools as `Mermail:list_mailboxes` / `Mermail:send_email`. Use the host-qualified names as listed; never invent a prefix.
4. After skill or connector updates, start a **new** chat before invoicing.
5. Smoke: read-only `list_mailboxes`, then draft-only invoice preview (no send).

## Codex

1. `codex mcp add mermail --url https://console.mermail.app/mcp` → `codex mcp login mermail` → inspect `/mcp`.
2. Skills from this repo install separately; they do not replace the OAuth connection.
3. Default prompt in `agents/openai.yaml` uses `Use $mermail-base-usdc-invoice …` — keep the `$` skill token.
4. API-key `env_http_headers` fallback is fine for compose/send; do not route this skill through PayBox.

## OpenCode / Cursor / OpenClaw

| Client | Connect | Skill load | Notes |
| --- | --- | --- | --- |
| Cursor | OAuth on hosted URL (or deeplink from mermail.app/agents) | Plugin / skills path from this repo | Restart Cursor after env changes; running desktop process ignores a later shell `export` |
| OpenClaw | `openclaw mcp add mermail --url https://console.mermail.app/mcp --transport streamable-http --auth oauth` then login + `doctor --probe` | ClawHub / local install; frontmatter `metadata.openclaw` requires `MERMAIL_API_KEY` as `primaryEnv` for catalog installs | Doctor probe must list capabilities — unauthenticated catalog ≠ healthy |
| OpenCode / generic | Same Streamable HTTP URL + OAuth or `x-api-key` | Load `SKILL.md` + `references/` as the skill package | Preserve bare protocol tool names from `tools/list` |


## Zed / dmux / other agent surfaces

| Client | Connect | Skill load | Notes |
| --- | --- | --- | --- |
| Zed | MCP server entry → hosted Mermail URL + OAuth or API key header | Point agent/skill root at this skill directory | Draft-only until approval; same URI formulas |
| dmux / generic | Streamable HTTP MCP + auth | Mount `SKILL.md` + `references/`; honor frontmatter `name` | Adapter-compliance: no invented wallet-send tools |

Cross-harness adapter-compliance and the full install-surface matrix live in [harness-compat.md](harness-compat.md) (harness-audit checklist).

## Quick harness audit checklist

- [ ] MCP `initialize` + `tools/list` show compose/send tools
- [ ] Skill name matches directory (`mermail-base-usdc-invoice`)
- [ ] Preview shows human USDC amount, atomic units, payee, EIP-681 URI
- [ ] Send blocked until explicit approval
- [ ] Post-send summary does **not** claim on-chain settlement
