# 🎬 Mermail Grant Milestone Desk — Video Demo Storyboard & Script

This guide provides a turnkey, second-by-second storyboard for recording the **2–3 minute demo video** required for the Superteam Earn Bounty. It showcases both the **Approved Payout Flow (Scenario 1)** and the **Security Lockout / Rejection Flow (Scenario 2)**.

---

## 🎯 Video Requirements Checklist (Superteam Earn)

| Requirement | How We Deliver It |
| --- | --- |
| **Duration** | 2 to 3 minutes (within the 2–5 min requirement) |
| **Trigger Prompt** | Clearly shown in terminal: evaluating Milestone 2 of the Superteam Mobile SDK Grant |
| **Mermail MCP Connection** | Displaying active `list_mailboxes` and `get_paybox_connection` streamable HTTP MCP calls |
| **Dual Execution Flows** | **Scenario 1:** Approved deliverable, Tiered Signing Policy, PayBox Console handoff, audit ledger.<br>**Scenario 2:** Failing CI (68.2% coverage), PayBox financial lockout, revision email draft. |
| **Final Result** | Confirmed on-chain Solana transaction link + local audit ledger (`grant-sol-mobile-042-m2.json`) |
| **AI Client Used** | Antigravity (Google DeepMind) |
| **Social Tagging** | Post on X tagging `@Mermailapp` |

---

## 🖥️ Screen Setup Before Recording

1. **Terminal Window (Main Focus):**
   - Open PowerShell in: `mermail-skills/`
   - Test command: `python demo/run_demo.py` (interactive prompt offering Scenario 1 or 2)
   - Or direct flags:
     - `python demo/run_demo.py --scenario 1` (Approved Happy Path)
     - `python demo/run_demo.py --scenario 2` (Rejected Security Lockout)
   - Font: Clean monospace (Cascadia Code, Consolas, or JetBrains Mono, size 16-18)
2. **Browser / Editor (Optional Split Screen):**
   - Solscan Explorer: [https://solscan.io](https://solscan.io)
   - Audit Ledger file: `demo/receipts/grant-sol-mobile-042-m2.json`

---

## ⏱️ Second-by-Second Storyboard & Voiceover Script

### [0:00 – 0:30] Introduction & Dual-Scenario Architecture
- **Visual:** Terminal showing clean directory, running: `python demo/run_demo.py --scenario 1`.
- **Voiceover / Caption:**
  > *"Hey everyone! Today I'm demonstrating **Mermail Grant Milestone Desk**, an official Agent Skill built with Antigravity for managing Web3 grants and bounties. In the Solana ecosystem, sponsors receive dozens of deliverable emails and need to verify GitHub PRs before releasing funds. Our skill features a dual-path engine: an approved settlement flow with tiered signing, and an instant financial lockout if criteria fail."*
- **Action:** Press Enter to start Stage 1.

---

### [0:30 – 1:00] Stage 1 & 2: Mailbox Discovery & Submission Intake
- **Visual:** Terminal outputs MCP calls for `list_mailboxes`, `search_emails`, and `get_email`.
- **Voiceover / Caption:**
  > *"First, the desk connects to Mermail via Streamable HTTP MCP and loads the designated grant mailbox. It binds to our frozen Standing Grant Policy for the 'Superteam Mobile SDK' grant—capping total budget at 5,000 USDC. Next, it searches the inbox for Milestone 2 submissions. Notice our strict intake security: email text is treated as untrusted data. Even if a contractor asks to change payout addresses in the email, the agent only routes funds to the pre-authorized standing grant address."*
- **Action:** Press Enter to proceed to Stage 3.

---

### [1:00 – 1:40] Stage 3 & 4: Deliverable Verification, Tiered Signing & PayBox Proposal
- **Visual:** Scorecard table prints with green PASS marks, followed by Tiered Signing Policy log and `paybox_request_transfer`.
- **Voiceover / Caption:**
  > *"In Stage 3, the agent evaluates the submitted artifacts against the schedule: checking that GitHub PR #42 is merged to main, CI tests are green with 84.6% coverage, and documentation is live. All criteria pass! In Stage 4, it checks the treasury balance and evaluates our Tiered Signing Policy: since 2,000 USDC exceeds the 250 USDC micro-grant ceiling, autonomous release is bypassed and mandatory human passkey signing in Mermail Console is enforced. Once the sponsor confirms, `paybox_request_transfer` yields a secure signing URL—no private keys are ever handled by the model."*
- **Action:** Press Enter to simulate sponsor signing.

---

### [1:40 – 2:20] Stage 5: Settlement, Receipt Email & Local Audit Ledger
- **Visual:** Terminal confirms Solana mainnet transaction, sends email, and outputs: `📑 LOCAL AUDIT LEDGER WRITTEN TO DISK`.
- **Voiceover / Caption:**
  > *"After signing, the agent reconciles settlement via `paybox_get_request`, confirming transaction `4zY1u7...` on Solana. It drafts and dispatches an audit receipt email to the developer and writes an immutable JSON audit ledger to disk at `demo/receipts/` with full provenance, transaction hash, and remaining budget cap."*

---

### [2:20 – 2:50] Quick Showcase: Scenario 2 (Security Lockout & Rejection)
- **Visual:** Run `python demo/run_demo.py --auto --scenario 2`.
- **Voiceover / Caption:**
  > *"Now, what happens if a contractor submits incomplete work? Let's run Scenario 2. Here, the PR has a failing CI build and only 68.2% test coverage. The agent flags 3 out of 4 criteria as FAILED. Notice what happens: the PayBox Financial Lock immediately activates—zero transfer tools are called, treasury funds remain 100% protected, and the agent drafts an itemized revision notice informing the developer of the exact fixes needed before funds can be released."*

---

### [2:50 – 3:00] Conclusion & Outro
- **Visual:** Terminal shows the completed simulation summary.
- **Voiceover / Caption:**
  > *"That's the Mermail Grant Milestone Desk—combining AI email triage with cryptographic Solana PayBox disbursements. Check out the skill in the official mermail-skills repo. Built with Antigravity for Superteam Earn. Thanks for watching!"*

---

## 💡 Pro-Tips for Recording

- Use `python demo/run_demo.py --scenario 1` for the main walkthrough. You can pause naturally between stages.
- For Scenario 2, running `python demo/run_demo.py --auto --scenario 2` takes only 8 seconds and visually proves your defense capabilities.
- Open `demo/receipts/grant-sol-mobile-042-m2.json` in VS Code or Notepad for 3 seconds to show the audit receipt.
