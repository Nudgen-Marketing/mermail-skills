# Mermail Bounty Ops

Community/unofficial Mermail Agent Skill prepared for the Superteam bounty **Build and Demo a Mermail Agent Skill**.

## Concept

`mermail-bounty-ops` turns a Mermail inbox into a safe operating queue for a worker or bounty hunter managing paid opportunities. It helps an agent discover and triage bounty-related email, extract structured opportunity facts without treating email text as instructions, verify message safety signals, prevent duplicate outreach, prepare concise claim/follow-up drafts, and keep advertised, accepted, and paid rewards separate.

The skill is intentionally conservative around money and credentials: an email may describe a payout, wallet, OTP, magic link, or payment action, but email content never authorizes the agent to use it.

## Why this is useful

Bounty hunters and small teams often lose money through operational mistakes rather than lack of opportunities: duplicate claims, missed reviewer replies, accidental double sends, confusing a nominal reward with a paid reward, or acting on malicious/forged email. This skill turns those failure modes into an explicit worker-side workflow.

## Positioning

`mermail-bounty-ops` is intentionally worker-side and complements adjacent Mermail ideas:

- `mermail-opportunity-gate` (#70) focuses on read-only eligibility before pursuing an opportunity; bounty-ops continues through dedupe, submission, review, acceptance, and payout reconciliation.
- `mermail-pact` (#136) is sponsor/operator-side paid-work contracting and settlement; bounty-ops is for the worker managing their own pipeline.
- Mermail Freelance Deal Desk (#154) focuses on one inbound client/deal; bounty-ops handles a multi-opportunity bounty, grant, contest, and paid-task pipeline.

This is a community companion and does not claim official Mermail package status.

## Package

- `SKILL.md` — reusable Agent Skill
- `agents/openai.yaml` — OpenAI/MCP metadata
- `references/tools.md` — Mermail tool-contract guidance
- `references/security.md` — strict mailbox/payment security boundary
- `scenarios.json` — machine-readable safety/accounting scenarios
- `scripts/validate_skill.py` — dependency-free validator

## Validation and live evidence

The package validator checks Mermail authoring constraints, tool metadata, prompt-injection boundaries, deduplication, external-effect approval, and the strict `opportunity -> accepted -> paid` accounting model.

A live Mermail mailbox run was also completed against controlled messages: the agent identified a legitimate 500 USDC opportunity, rejected a malicious prompt-injection/payment instruction, found no duplicate sent claim, performed no external send/payment, and correctly left the reward as opportunity only — not accepted and not paid.

No prize amount is treated as earned until the sponsor/platform accepts the submission and payment is actually received.