# 🚀 Mermail Agent Skill Bounty — Submission Package

This document contains all ready-to-use materials for opening the GitHub Pull Request and submitting to Superteam Earn.

---

## 1. GitHub Pull Request Details

- **Target Repository:** [`Nudgen-Marketing/mermail-skills`](https://github.com/Nudgen-Marketing/mermail-skills)
- **Base Branch:** `main`
- **Head Branch:** `feat/mermail-grant-milestone-desk`
- **PR Title:** `feat(skill): add mermail-grant-milestone-desk agent skill`

### PR Body (Markdown to paste into GitHub):

```markdown
### Overview

This pull request introduces **`mermail-grant-milestone-desk`**, an official infrastructure persona skill that automates Web3 grant and bounty milestone management through Mermail mailboxes and PayBox Agent Wallet on Solana.

Grant programs, DAOs, and hackathon sponsors receive deliverable submissions via email (GitHub pull requests, test reports, documentation). This desk coordinates intake, sanitizes untrusted input, validates deliverables against a pre-authorized standing grant policy, prepares human-in-the-loop PayBox transfer proposals (Solana USDC), and drafts immutable on-chain audit receipt emails.

### Video Demo & Walkthrough

Full 3-minute end-to-end voiceover demo: [Watch on X (Twitter)](https://x.com/CaganNebil/status/2101083888512860288)

### Key Capabilities

1. **Untrusted Input Defense:** Email subjects, bodies, PR descriptions, and attachments are treated as untrusted data. Email content cannot modify budget caps, redirect grantee payout addresses, or trigger automated debits.
2. **Standing Grant Policy Binding:** Payout addresses and budget ceilings are strictly bound to an authenticated grant record, preventing address spoofing.
3. **PayBox Financial Guardrails:** Uses `paybox_request_transfer` with human-in-the-loop console signing (`signing_handoff.console_url`). Private keys (`pbxk1`, `BS58_PRIVATE_KEY`) are never handled or logged by the model.
4. **Idempotent Audit Receipts:** Once settlement is reconciled via `paybox_get_request`, an audit receipt email is drafted and sent to the grantee thread with an idempotency key (`grant-receipt-{grant_id}-{milestone_id}-{tx_hash}`).

### File Changes

- `skills/mermail-grant-milestone-desk/SKILL.md`: Main specification conforming to repository standards (<= 500 lines, YAML frontmatter with OpenClaw metadata).
- `skills/mermail-grant-milestone-desk/agents/openai.yaml`: Agent interface metadata and MCP dependency.
- `skills/mermail-grant-milestone-desk/references/tools.md`: Composed tools contract and native JSON argument guidelines.
- `skills/mermail-grant-milestone-desk/references/security.md`: Strict intake, prompt injection defense, and signing handoff boundaries.
- `skills/mermail-grant-milestone-desk/references/workflows.md`: End-to-end 7-stage state machine.
- `skills/mermail-grant-milestone-desk/references/templates.md`: Standing policy, evaluation scorecard, and receipt templates.
- `tool-coverage.json`: Registered under `infrastructureSkills`.
- `skills/mermail/references/routing.md`: Domain routing and precedence table entries.
- `compatibility.json`: Updated skill catalog count to 18.
- `tests/scenarios.json`: Added 6 validation scenarios covering routing, deliverable verification, injection defense, PayBox proposal, and settlement receipt.
- `demo/run_demo.py`: Standalone interactive simulation test runner with test fixtures.

### Verification & Test Evidence

Repository validation suite passes with zero errors:

```bash
$ npm test

> mermail-skills@1.5.5 test
> node tests/validate.mjs

Validated 18 skills and 71 business tools.
```
```

---

## 2. Superteam Earn Submission Form Details

When submitting at [Superteam Earn - Build and Demo a Mermail Agent Skill](https://superteam.fun/earn/listing/build-and-demo-a-mermail-agent-skill):

- **Skill Name:** `Mermail Grant Milestone Desk`
- **AI Client Used:** `Antigravity (Google DeepMind)`
- **Short Description (English):**
  > Mermail Grant Milestone Desk is an official agent skill designed for Web3 grant managers and hackathon sponsors on Solana. It automates contractor deliverable intake through Mermail mailboxes, sanitizes untrusted input, evaluates GitHub PRs against a standing grant schedule, checks Solana USDC budget caps, proposes human-approved PayBox transfers with console signing handoffs, and dispatches on-chain audit receipt emails upon settlement.
- **GitHub PR Link:** `https://github.com/Nudgen-Marketing/mermail-skills/pull/YOUR_PR_NUMBER`
- **Demo Video Link:** `https://x.com/CaganNebil/status/2101083888512860288`

---

## 3. Post to X (Twitter) Template

Attach your 2–3 minute screen recording to a tweet with the following text:

```text
Built and open-sourced the Grant Milestone Desk skill for @Mermailapp! 🏛️⚡

Grant managers & DAOs can now manage milestone reviews directly from their inbox:
✅ Email deliverable intake & PR verification
✅ Strict untrusted input & address spoofing defense
✅ Human-in-the-loop PayBox @solana USDC transfers
✅ On-chain settlement receipts with @solscan explorer links

Built with @GoogleDeepMind Antigravity for @SuperteamEarn.

GitHub PR: https://github.com/Nudgen-Marketing/mermail-skills/pull/YOUR_PR_NUMBER

#Solana #AIagents #Mermail #Superteam
```

---

## 4. Git Instructions for Submitting the PR

Since `git` can be run from GitHub Desktop or command line, here are the step-by-step commands:

1. **Fork the repository** on GitHub: [https://github.com/Nudgen-Marketing/mermail-skills](https://github.com/Nudgen-Marketing/mermail-skills) (Click "Fork").
2. In your fork, create a new branch named `feat/mermail-grant-milestone-desk`.
3. Commit the new files in `skills/mermail-grant-milestone-desk/`, `demo/`, `DEMO_STORYBOARD.md`, and the modified `tool-coverage.json`, `compatibility.json`, `routing.md`, and `tests/scenarios.json`.
4. Push to your fork and click **"New Pull Request"** targeting `Nudgen-Marketing/mermail-skills:main`.
5. Paste the PR description from Section 1 above.
