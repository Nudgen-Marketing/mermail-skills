# Trial Expiry Guard

## What this skill enables
This skill lets an AI agent track free trials from confirmation emails, remember their end dates and pricing, and decide — using real wallet balance data — whether to continue or cancel before the trial converts to a paid subscription.

## How it interacts with Mermail
- Inbox: reads incoming emails to detect trial confirmation messages, extracts trial length/end date/price
- PayBox: checks wallet balance to decide pay vs. cancel when a trial is ending
- Calendar (external tool): sets a reminder ahead of expiry, since the agent can't run in the background between conversations

## Workflow
1. User asks the agent to check the inbox for trial signups
2. Agent scans unread emails, identifies trial confirmations, extracts: service name, start date, end date, price after trial
3. Agent logs the trial in a running tracking list
4. Agent sets a calendar reminder for the day before expiry
5. On a later prompt (manual or reminder-triggered), agent checks PayBox balance
6. Agent decides: continue (if funds available and under threshold) or recommend/draft cancellation (if not)

## Example prompts and expected results
- "Check my Mermail inbox for any new trial signups and track them." → Agent finds new confirmation emails, logs trial details
- "It's the last day of StreamFlow's trial — check my PayBox balance and decide whether to continue or cancel." → Agent checks balance, makes and explains the pay/cancel call

## Limitations
- The agent cannot run in the background or watch dates on its own between conversations; a calendar reminder or external scheduled task is required to re-trigger the check near expiry
