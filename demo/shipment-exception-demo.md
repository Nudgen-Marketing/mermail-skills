# Shipment Exception Desk demo runbook

Target length: 2–5 minutes. Use a test workspace and synthetic shipment data only.

1. Show the connected Mermail MCP server and invoke `mermail-shipment-exception-desk`.
2. Send or select a synthetic clean email claiming package `DEMO-4821` was delivered, while the owner prompt states it was not received.
3. Ask: "Use Mermail to investigate shipment DEMO-4821, keep the claims separate, and save an evidence-request draft."
4. Show bounded mailbox discovery, metadata-first search, the selected clean message, and the source-linked timeline.
5. Show the `uncertain` classification: email-reported delivery is not converted to verified delivery.
6. Show the saved draft with no send call. Explain that external delivery still needs an exact preview and user approval.
7. End on the final case result and the public skill files.

Record the actual Mermail interaction. A slide deck or code walkthrough does not satisfy the bounty. Use English, post the final 2–5 minute video on X, tag `@Mermailapp`, and include the video URL in the pull request and Superteam submission.
