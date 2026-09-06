# Workflow Reference

Step-by-step flow the agent follows when this skill is triggered.

1. **Get or create the mailbox.** Call `list_mailboxes`. If none exists, call `create_mailbox`. Note the resulting address as `{{INBOX_EMAIL}}` — this is the identity used for sign-up.

2. **Submit the sign-up form.** Using a connected browser tool, open the target service's sign-up page and submit `{{INBOX_EMAIL}}` as the account email. If no browser tool is connected, stop and tell the user what to connect — do not attempt to guess or skip this step.

3. **Poll the inbox for the confirmation email.** Call `search_emails` (falling back to `list_emails` if needed), filtering by the expected sender domain or a recent timestamp. Poll on a short backoff — every 5–10 seconds, up to a 2-minute timeout. If nothing arrives in that window, stop and report it clearly. Never fabricate a success.

4. **Read and extract the verification info.** Call `get_email` on the matched message. Parse the body for exactly one of:
   - A numeric OTP code, or
   - A confirmation/verification link
   If multiple candidate emails match, use the most recent one from the expected sender.

5. **Complete verification.** Enter the OTP into the service's verification field, or open the confirmation link — both via the browser tool, continuing the same session used in step 2.

6. **Confirm success.** Check for a clear success signal: a confirmation page, an "active account" state, or a follow-up welcome email. Only report success once one of these is observed.

7. **Report back to the user.** Include: the service signed up for, the Mermail address used, the verification outcome, and any relevant account details (plan, next steps).

## Edge case: no action needed

Some services confirm the subscription immediately and send a welcome email with no further link or code to act on (this was the case in the working demo, using Morning Brew). In this case, the agent should recognize that no action is required and report the subscription as already confirmed, rather than searching for a link that doesn't exist.
