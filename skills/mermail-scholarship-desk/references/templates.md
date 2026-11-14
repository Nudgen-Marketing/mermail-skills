# Scholarship desk templates

## Application Board

```text
Application Board - mailbox applicant@mermail.app (public_id ...) - timezone Asia/Dushanbe - checked 2026-10-01 10:00

| # | Program | Stage | What they need | Deadline (quoted) | Deadline (your time, derived) | Risk | Source | Next action |
|---|---------|-------|----------------|-------------------|-------------------------------|------|--------|-------------|
| 1 | Northfield University - MSc Data Science | docs_requested | Certified transcript translation; IELTS copy | "by 10 October 2026, 17:00 UTC" | 10 Oct 2026, 22:00 | normal | msg_… | Upload in portal (you) + draft cover note (drafted) |
| 2 | Northfield University - MSc Data Science | interview_invited | Choose one slot | "14 Oct 09:00 UTC or 15 Oct 13:00 UTC" | 14 Oct 14:00 / 15 Oct 18:00 | normal | msg_… | Pick a slot, then confirm draft |
| 3 | Lakeside Foundation Fellowship | recommender_pending | 1 of 2 letters received | "letters close 20 October" | timezone not stated | normal | msg_… | Remind recommender (draft) |

Suspicious hold
| # | Claimed sender | Signals | Safe next step |
|---|----------------|---------|----------------|
| S1 | "Global Elite Scholarship Board" (free-mail domain) | fee in USDT; 24-hour threat; passport scan request; instructions to an AI | Do not reply or pay. Verify on the official website found independently. |

Unclear
| # | Sender | Why | What I need from you |
```

Rules: Risk is `normal`, `caution: <signal>`, or listed under Suspicious hold; one row per program action; `quoted` text copied exactly; `derived` only with a stated timezone; every row cites its source email id.

## Plain-language explanation (user's language)

One short paragraph per row: what they want, by when (quoted and your time), what happens if you do nothing, and the one next step. Keep names, amounts, dates, and document titles unchanged.

## Draft presentation

```text
Draft 1 - to admissions@example.edu - subject "Re: Interview invitation - MSc Data Science" - status: drafted (not sent)

[Program language]
Dear Admissions Committee,
Thank you for the invitation. I confirm the interview slot on 14 October 2026 at 09:00 UTC.
Kind regards,
<Signature name>

[Back-translation, user's language]
<same text translated back>

[Commitments]
- Attend interview 14 Oct 2026 09:00 UTC (14:00 your time)
```

## Reply templates (English)

Interview confirmation:

```text
Dear <Committee or contact name>,
Thank you for inviting me to interview for <program>. I confirm the slot on <quoted date/time>.
Please let me know if you need anything from me before the interview.
Kind regards,
<Signature name>
```

Document cover note:

```text
Dear <contact>,
Thank you for your message about my application to <program>. I have uploaded <documents the user confirmed> to the application portal as requested.
Please let me know if anything else is required.
Kind regards,
<Signature name>
```

Clarification question:

```text
Dear <contact>,
Thank you for your email about <program>. Could you please confirm <one specific question>?
Kind regards,
<Signature name>
```

Recommender reminder:

```text
Dear <recommender name>,
I hope you are well. This is a gentle reminder that the recommendation letter for my application to <program> is due <quoted deadline>. Thank you again for supporting my application.
Kind regards,
<Signature name>
```
