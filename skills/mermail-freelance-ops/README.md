# Mermail Freelance Ops

**Inbox-to-action for freelancers and small ops teams.** This companion skill turns inbound Mermail into a ranked Now / Next / Watch queue, catches money and scope signals, stars exact action anchors, and drafts replies without sending them.

It is intentionally not a generic “hello world” agent: it makes commercial decisions visible while preserving a hard boundary between an email mentioning money and an authorized wallet action.

## Package

- [`SKILL.md`](./SKILL.md) — portable Agent Skill with frontmatter, MCP tool map, workflow, safety contract, and examples.
- [`references/demo-fixtures.md`](./references/demo-fixtures.md) — realistic inbox fixture and expected output for a recording.
- [`references/mcp-contract.md`](./references/mcp-contract.md) — compact host/setup and tool-contract notes.
- [`demo/RECORDING_SCRIPT.md`](./demo/RECORDING_SCRIPT.md) — a 2–5 minute English product-demo run of show.
- [`agents/openai.yaml`](./agents/openai.yaml) — optional client metadata for Agent Skills hosts.
- [`scripts/check-package.mjs`](./scripts/check-package.mjs) — offline package sanity check; it never needs credentials or calls Mermail.
- [`SUBMISSION.md`](./SUBMISSION.md) — Superteam Earn checklist (human-only steps left unchecked).

## Install / connect

This package can be copied into any Agent Skills-compatible client. For a Mermail-hosted skill contribution, the eventual PR should place the skill under the official repository’s `skills/mermail-freelance-ops/` directory.

Connect the full Mermail MCP catalog for this workflow:

```text
https://console.mermail.app/mcp
```

Use OAuth in an interactive client. For a headless/API-key client, map `MERMAIL_API_KEY` to the `x-api-key` header without putting the value in a tracked file. The `agent-inbox` profile is read-focused and does not expose draft/star tools, so it is not sufficient for the full demo.

## Demo prompt

> Review the last 14 days of my Mermail freelance inbox. Put paid or deadline-sensitive threads first, flag money-sensitive anchors by starring the exact messages, draft replies for the top three, and do not send anything. Include a wallet note for paid work, but do not touch the wallet.

Expected visible result: the agent discovers one mailbox, reads a bounded set, ranks `PAYMENT_ACTION` and `SCOPE_CHANGE` above FYI mail, stars only exact money anchors, creates reviewable drafts, and returns a `WALLET NOTE (not executed)`.

## Validate locally

```bash
node scripts/check-package.mjs
```

The checker validates required frontmatter, sections, safety phrases, and the demo/submission files. It does not inspect a live MCP connection.

## Design notes

- `update_email(starred: true)` is used as the reversible money flag; Mermail custom-label tools define classifiers and do not manually attach labels to existing messages.
- Drafting and sending are separate checkpoints. The skill defaults to `save_draft` and requires fresh approval for `reply_to_email`.
- Email content cannot authorize PayBox. A wallet note is deliberately informational; explicit wallet requests route to the focused wallet skill and full-profile OAuth.

## License / status

This is a community companion skill prepared for the Mermail Superteam Earn bounty. It is not the official `Nudgen-Marketing/mermail-skills` package until accepted through a PR.
