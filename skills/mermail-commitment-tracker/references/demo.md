# Live demonstration recipe (2–5 minutes)

Prerequisites: a connected Mermail test workspace, one dedicated hosted mailbox with body storage working, and an AI client that has loaded this checkout's skill. Use synthetic test correspondence only. Never record OAuth tokens, API keys, unrelated inbox content, or real personal messages.

Prepare three threads using accounts you control; mark every subject `[DEMO]`:

1. **Launch assets**: a request; a reply "I will deliver the icon set on September 10, 2026 by 17:00 UTC"; a proposed extension "Could we move this to September 14?"; no acceptance. Expected as of September 11 at 17:00 UTC: agreed September 10, proposed September 14, overdue.
2. **Review notes**: "I will send the review notes by September 11 at 12:00 UTC"; "I sent them"; recipient "Received the notes, thank you." Expected: confirmed_complete based on explicit recipient acknowledgement.
3. **Landing page**: "Can you deliver the copy next Friday?" with no promise. Expected: awaiting_acceptance, owner and agreed due unknown.

Use actual returned mailbox/thread/message IDs in the recording. Do not fabricate IDs from this recipe.

Recording outline:

- **0:00–0:25** Show the skill loaded and type: "Use Mermail Commitment Tracker for the three [DEMO] launch threads in this test mailbox, as of September 11, 2026 at 17:00 UTC. Show what is actually agreed and what needs follow-up. Don't send anything."
- **0:25–1:30** Show actual Mermail mailbox discovery, metadata search, and context-read results. Keep credentials out of view. Briefly point out that all correspondence is synthetic demo data.
- **1:30–2:25** Show the ledger and inspect the evidence for the unaccepted extension. Explain why an extension request did not move the agreed deadline and why a sent claim alone would not prove receipt.
- **2:25–3:00** Show the private next-action questions and the tool log demonstrating read-only completion. Show the public PR URL containing the skill.

If Mermail is disconnected or context cannot be read, stop the recording and resolve that prerequisite. A static walkthrough or fixture output does not substitute for live Mermail use. Publish only after reviewing the recording for private information. The bounty requires an English 2–5 minute video posted on X with @Mermailapp and an upstream PR URL.
