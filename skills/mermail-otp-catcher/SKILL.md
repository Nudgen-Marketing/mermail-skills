---
name: mermail-otp-catcher
description: Catch verification and OTP codes from a Mermail inbox. Use when an agent or user is waiting for a signup code, 2FA code, password-reset code, or any numeric verification code sent by email.
metadata:
  openclaw:
    requires:
      env:
        - MERMAIL_API_KEY
    primaryEnv: MERMAIL_API_KEY
    homepage: https://docs.mermail.app/ai/skills
    emoji: 🔐
---

# Mermail OTP Catcher

## What this skill enables

Every agent that signs up for online services hits the same wall: **"enter the verification code we just emailed you."** This skill turns a Mermail inbox into a verification-code router. It watches for incoming OTP/2FA/signup codes, extracts the code plus its context (which service, when it expires), and hands it to the agent or user in seconds — no manual inbox digging.

Typical triggers:
- "I'm waiting for a verification code from GitHub"
- "Check my inbox for the 2FA code"
- "Did the signup code arrive yet?"
- After any agent-driven service registration that requires email verification

## How it interacts with Mermail

- **Inbox (read-only):** uses `search_emails` / `get_email` to find unread messages matching verification-code patterns. Discovers the mailbox once with `list_mailboxes` and reuses its `public_id` as `mailboxId`.
- **Labels (write, safe):** uses `create_custom_label` and `move_email` to mark processed code emails (`otp-processed`) so repeat runs don't re-report the same code.
- **No sending, no wallet:** this skill never sends email and never touches the Agent Wallet. It is strictly read + label.

See [references/tools.md](references/tools.md) for the exact tool mapping and [references/security.md](references/security.md) for the trust model (verification codes are sensitive — treat accordingly).

## Workflow (start to finish)

1. **Trigger** — user/agent asks for a verification code, optionally naming the service (e.g. "GitHub code").
2. **Discover mailbox** — call `list_mailboxes`, pick the agent's inbox, cache its `public_id`.
3. **Search** — query unread emails from the last 30 minutes with `search_emails`. Match against verification patterns:
   - 4–8 digit numeric codes (`\b\d{4,8}\b`)
   - Common subjects: "verification code", "your code is", "2FA", "one-time passcode", "confirm your email", "security code"
   - If a service name was given, prefer emails from that sender/domain.
4. **Extract** — from the best match, pull:
   - The code itself
   - Service name (sender name/domain)
   - Expiry window if stated ("expires in 10 minutes", "valid for 5 minutes")
   - Received timestamp
5. **Verify freshness** — reject codes older than 30 minutes with a warning ("this code may have expired"). If multiple codes from the same service exist, report only the newest.
6. **Present** — reply in chat with a clear card:
   ```
   🔐 Verification code for <Service>
   Code: 482 913
   Received: 2 min ago | Expires: ~8 min remaining
   ```
7. **Label** — apply the `otp-processed` label to the email so the next run skips it.
8. **Report** — confirm what was found (or "no new verification codes in the last 30 minutes") and stop. Never loop indefinitely — one pass per trigger.

## Example prompts and expected results

**Prompt:** "I'm waiting for a verification code from Vercel"
**Expected result:** Agent searches the Mermail inbox, finds the Vercel email from 3 minutes ago, replies with the 6-digit code plus expiry info, and labels the email `otp-processed`.

**Prompt:** "Check for any new 2FA codes"
**Expected result:** Agent scans unread mail from the last 30 minutes, reports each fresh code grouped by service (newest only per service), labels them all.

**Prompt:** "Did my GitHub code arrive yet?" (nothing arrived)
**Expected result:** Agent reports "No verification emails from GitHub in the last 30 minutes" and suggests checking the signup went through — it does not invent a code.

## Limitations

- Cannot receive codes sent by SMS or authenticator apps — email only.
- Cannot extend a code's expiry; if the code is stale, the user must request a new one from the service.
- The agent cannot run in the background between conversations; re-trigger the skill (or a scheduled task) to poll for new codes.
- Heavily obfuscated codes (images only, no text) cannot be extracted without OCR — report these as "code present but not machine-readable."
