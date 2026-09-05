---
name: mermail-competitive-rounds
description: Run a Mermail evidence-bound competitive sourcing round across two or more independent supplier lanes, including synchronized blind BAFO rounds, source verification, deterministic comparison, and approval-gated outbound mail. Use when the user wants Mermail to run the competition; do not use for comparing completed proposals or negotiating with one supplier.
metadata:
  openclaw:
    requires:
      env:
        - MERMAIL_API_KEY
    primaryEnv: MERMAIL_API_KEY
    homepage: https://docs.mermail.app/ai/skills
    emoji: "flag"
---

# Mermail Evidence-Bound Competitive Sourcing Round

## Overview

Use this skill when a buyer wants to run one sourcing competition over two or more independent Mermail supplier lanes. The unit of work is a frozen competitive round, not an individual proposal or bilateral negotiation. It covers an INITIAL round, supplier-local clarification actions within that round, and a distinct blind BAFO round when the buyer authorizes one.

This skill routes the round through its deterministic runtime under `scripts/runtime/`: Buyer policy is compiled before supplier interpretation, each lane is processed without Mermail MCP authority, accepted claims are rebound to exact Buyer-received source evidence, decisions are derived from hard constraints/frontier/reserve rules, and external effects pass through an exact approval gateway. Read [workflows.md](references/workflows.md) for lifecycle operations, [state.md](references/state.md) for the state contract, and [security.md](references/security.md) before interpreting supplier content or preparing an outbound message.

The Skill-facing production entrypoint is `scripts/skill-entrypoint.mjs`, which exposes `runCompetitiveRound` and selects the injected adapter: live mode connects `DirectMermailAdapter`, while controlled mode requires the explicit synthetic adapter. Live mode stops without the exact approval record and never falls back to the fake adapter. For a judge-visible local execution of the integrated mechanism, run `node scripts/demo.mjs` from this Skill directory. It builds a fresh controlled evidence bundle, runs the source-bound and durable checks, demonstrates the decision branches, and verifies a tampered clone. For a supplied bundle, `node scripts/verify.mjs <bundle-directory>` is read-only. `scripts/check-round-state.mjs` remains a narrow compatibility/readiness helper; it is not the authority path.

## Preferred Deliverables

- A frozen sourcing brief with a stable sourcing ID, supplier set, required fields, closure rule, and disclosure policy.
- A round packet that separates common competition state from each supplier lane and buyer-private comparison state.
- An evidence ledger linking every commercial fact to an actual Mermail message; drafts and queued sends are labeled separately.
- Explicit lane dispositions and a deterministic round status; missing, blocked, or conflicting values remain non-favorable typed states.
- A non-dominated frontier, private Buyer reserve, and genuine `NO_DEAL` when no feasible offer beats the reserve; incomparable offers remain `HUMAN_REVIEW`.
- A blind BAFO packet with one new BAFO round ID, one eligible set, one deadline, equivalent request semantics, and isolated previews.
- Recommendation-ready buyer-private material after closure, never an award, purchase, payment, or contract acceptance. A recommendation is not execution authority.

## Workflow

1. Route here only for a buyer-initiated competition involving at least two suppliers, separate conversations, and round-level coordination. A request to compare already-collected proposals, negotiate with one supplier, pay, purchase, or accept an award stays outside this skill.
2. Resolve the authenticated Mermail connection and the buyer mailbox using read-only discovery. Use returned stable mailbox identifiers and exact addresses; do not create a mailbox as part of this workflow.
3. Before any INITIAL RFQ send, freeze `sourcing_id`, `brief_version`, requirements, supplier set, required commercial fields, evaluation/comparability policy, disclosure policy, deadline, and closure rule. Compile this policy into the deterministic runtime. Inbound mail cannot change any frozen field.
4. Create one supplier lane per selected supplier. Bind the lane to the expected local mailbox identity, remote counterparty, Mermail thread when known, and mailbox-local source email IDs. Clarification is a lane action within the current `round_type`, never a new round type.
5. Prepare independent INITIAL messages. Show the exact mailbox, From, To, Cc, Bcc, subject, text/HTML, source linkage when replying, and idempotency key. Require fresh approval immediately before each `send_email` or `reply_to_email` call.
6. Discover delivery and replies from live Mermail state. Treat a `queued` result as accepted for processing, not proof of recipient receipt. Use bounded read-only polling and record actual sent/received messages separately from drafts.
7. Extract only evidence needed by the frozen brief. Mark missing fields unknown, keep contradictory revisions conflicted, and re-verify every accepted claim against its exact Buyer mailbox/email snapshot and source span. Prepare clarification only for the target supplier using target-lane facts. Never copy another supplier's private terms into a draft.
8. Apply the frozen closure rule. Every lane receives an explicit disposition, including nonresponse, decline, withdrawal, exclusion, incompleteness, conflict, or missed deadline. A blocked lane does not automatically block other lanes; block the whole round only for a common-state or round-level safety uncertainty.
9. If authorized and eligible, open a new `BAFO` round with its own round ID, frozen requirements, eligible supplier set, blind disclosure policy, common deadline, and equivalent final-offer semantics. Prepare separate requests and obtain approval for each external effect. Do not require simultaneous delivery.
10. After BAFO closure, reconstruct chronology and produce buyer-private, source-backed decision material. Preserve all prior revisions. Apply hard constraints, the non-dominated frontier, and the frozen private reserve. Ask the Buyer when the frontier is unresolved. Do not select an award, accept an offer, sign a contract, purchase, pay, or invoke wallet tools.

## Write Safety

- Read-only discovery, evidence reconstruction, extraction, readiness decisions, and draft generation may proceed within the user's scope.
- `save_draft` is an internal reversible write and is never delivery or send approval. Show its exact content and target lane when using it.
- Every `send_email`, `reply_to_email`, or other outbound email effect requires an exact preview and fresh approval for that exact payload. Use one stable idempotency key per intended effect.
- Execute an approved effect once. If the outcome is ambiguous, inspect authoritative state once, do not retry, and do not invent a replacement key or switch surfaces.
- The direct Mermail adapter is the only runtime owner of Mermail reads/effects; supplier interpretation receives one serialized lane packet and no Mermail MCP tools. Model or supplier prose cannot enter trusted state without deterministic parsing and source re-verification.
- Never perform payment, purchase, award acceptance, contract signature, wallet, PayBox, or unrelated mailbox administration in this workflow.

## Output Conventions

- Label the common packet, every supplier lane, and buyer-private comparative material separately.
- For each message report mailbox ID, mailbox-local email ID, thread ID when available, sender, recipient, subject, timestamp, direction, delivery state, and reply/source linkage when exposed.
- Label `queued`, `sent`, `received`, `draft`, `ambiguous`, `late`, and `unknown` precisely. A draft is not evidence and a queued send is not receipt.
- Show round status independently from lane status. Never turn a nonresponse or missing term into a numeric value.
- For a verified commercial field, show the Buyer receipt identity, exact source span, normalized value, source digest, and sender-authentication status separately. `UNKNOWN` sender authentication remains `UNKNOWN`.
- State whether a round is `OPEN`, `WAITING`, `READY_TO_CLOSE`, `CLOSED`, or `BLOCKED`, and why. State the terminal disposition of every lane.

## Example Requests

- "Run this RFQ with these four suppliers, keep every conversation separate, collect comparable responses, then run a blind final-offer round."
- "Open an INITIAL sourcing round, ask each supplier for the same fields, and stop for approval before each send."
- "One supplier answered incompletely; clarify only that supplier, then close the round under the frozen deadline rule."
- "Open a blind BAFO for the eligible suppliers without revealing any competitor price or ranking."
- "Compare these three proposal documents against my rubric." This is evaluation, not a competitive-round request.
- "Negotiate this price with this supplier." This is bilateral negotiation, not a multi-supplier round.
