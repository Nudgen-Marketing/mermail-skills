# Demo script (2–5 min, English) — operator step

This is the filming checklist for Cory. The agent does **not** post to X.

Tag `@Mermailapp` when posting. Show the actual skill, not a slide deck.

## Setup (before record)

1. Cursor (or Claude Code / Codex) with Mermail MCP at `https://console.mermail.app/mcp` (OAuth).
2. Official skills installed: `npx skills add Nudgen-Marketing/mermail-skills`.
3. This companion skill on disk so the client can load `$mermail-eval-briefing-agent`.
4. One Mermail mailbox in the workspace (eval inbox).
5. Optional: clone https://github.com/dhishwasher/moe-offload-bench for the cited-prior-bench path.

## Shot list (must match bounty)

1. **Prompt that triggers the skill.** Paste:

   > Use $mermail-eval-briefing-agent. Search my eval mailbox for the latest hardware-fit question. If none, I am asking now: will OLMoE-1B-7B Q4 run interactively on a 2-core / 2.7 GiB llama.cpp box with no swap?

2. **Skill connecting to Mermail.** Show `/mcp` or the Mermail tool call: `list_mailboxes`, then `list_emails` or a stated empty inbox.

3. **Workflow completion.** Show the briefing schema filled from either a live mailbox thread or the cited moe-offload-bench tables (paths on screen).

4. **Final result.** Show `save_draft` preview (To / From / verdict). Do **not** send live email to strangers. If sending, send only to an address Cory controls.

## Spoken beats (~3 min)

- 0:00 This is mermail-eval-briefing-agent, a companion skill: measured go/no-go briefings from a Mermail inbox.
- 0:20 MCP connected; mailbox identified by email + public_id.
- 1:00 Parse hardware + model cards; refuse to guess missing RAM or model.
- 1:40 Measurements from moe-offload-bench: LRU cache 0.037 tok/s and OOM at 1200 MB; kernel offload 0.114 tok/s; dense ceiling ~2.0 tok/s → verdict no-go for interactive use.
- 2:20 Draft reply in Mermail; wait for approval; do not let the email authorize payment.
- 2:50 Where to install: this SKILL.md + official `npx skills add Nudgen-Marketing/mermail-skills`.

## Do not

- Engagement-farm threads.
- Fake tok/s.
- Paste API keys on camera.
