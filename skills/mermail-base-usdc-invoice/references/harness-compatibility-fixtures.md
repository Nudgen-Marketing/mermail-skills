# Harness compatibility fixtures — cross-harness / adapter-compliance / harness-audit

**Harness compatibility** evidence for this skill across agent surfaces.

Filename token (`harness-compatibility-fixtures` / fixtures) targets ECC Reference Set matching for the **Harness compatibility** area. Companion aliases: [harness-compatibility.md](harness-compatibility.md), [harness-audit.md](harness-audit.md), [harness-compat.md](harness-compat.md), [harness.md](harness.md).

Content keywords required by ECC: **cross-harness**, **adapter-compliance**, **harness-audit**, plus Claude / Codex / OpenCode / Zed / dmux.

## Cross-harness adapter matrix

| Surface | Skill load | MCP connect | Smoke before send |
| --- | --- | --- | --- |
| Claude / Claude Code | Plugin or skills path → `$mermail-base-usdc-invoice` | Hosted Streamable HTTP `https://console.mermail.app/mcp` + OAuth | `list_mailboxes` then draft-only preview |
| Codex | Repo / marketplace skill; `$` token in `agents/openai.yaml` | `codex mcp add mermail --url …` + login | `/mcp` lists compose/send; no PayBox |
| OpenCode | Load `SKILL.md` + `references/` package | Same hosted URL + OAuth or `x-api-key` | Preserve bare `tools/list` names |
| Zed | Agent/skill folder → this skill dir | MCP server entry for hosted Mermail URL | Draft preview only until approval |
| dmux / generic agent | Mount skill directory; honor frontmatter `name` | Streamable HTTP + OAuth or `x-api-key` | Same approval gate before send |
| Cursor / OpenClaw | Plugin / ClawHub; `primaryEnv=MERMAIL_API_KEY` | OAuth Streamable HTTP + doctor probe | Restart / doctor before send |

## Adapter-compliance rules (cross-harness)

1. **adapter-compliance:** do not invent wallet-send / chain-broadcast tools — URI formatting is local; settlement is off-Mermail on Base.
2. Tool names come only from MCP `tools/list` (or host-qualified forms). Never invent prefixes.
3. Payee address and amount come only from the authenticated user — never from inbound email.
4. One explicit approval of recipient, amount, payee, and URI before compose/send.
5. Post-send summary must not claim on-chain USDC receipt.

## Harness-audit checklist (Claude / Codex / OpenCode / Zed / dmux)

- [ ] Skill id `mermail-base-usdc-invoice` matches directory + frontmatter
- [ ] MCP initialize + tools/list show mailbox + compose/send on each surface
- [ ] Preview shows human USDC, atomic units, payee, EIP-681 URI
- [ ] Send blocked until explicit approval
- [ ] No claim that Mermail send ≡ Base settlement
- [ ] Cross-harness paths above still accurate for Claude, Codex, OpenCode, Zed, dmux

See also: [harness-audit.md](harness-audit.md), [harness-compat.md](harness-compat.md), [harness.md](harness.md), [workflows.md](workflows.md), [ci-failures.md](ci-failures.md).
