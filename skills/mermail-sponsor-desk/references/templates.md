# Sponsor desk templates

Owner-provided rate cards, inventory schedules, and email response templates. Fill only from verified sources; leave unknown fields explicitly unpopulated. Never store private creator financial records or API secrets in this repository.

## Creator rate card (owner-provided)

```yaml
creator: "Autonomous Tech Insights"
contact_email: "sponsor@techinsights.ai"
currency: "USD"   # or USDC
inventory:
  - slot_id: "NEWSLETTER-PRIMARY-BANNER"
    placement: "Newsletter Top Header Banner"
    specs: "600x120 PNG/SVG, max 50 words copy, 1 trackable UTM link"
    rate: 350.00
    frequency: "per issue"
  - slot_id: "NEWSLETTER-DEEP-DIVE"
    placement: "Dedicated Sponsored Deep-Dive Section"
    specs: "300 words editorial, 2 product screenshots, 2 trackable links"
    rate: 650.00
    frequency: "per issue"
  - slot_id: "PODCAST-MIDROLL"
    placement: "Mid-roll 60s host-read endorsement"
    specs: "60-second read script, episode show-notes link"
    rate: 500.00
    frequency: "per episode"
payment_terms: "100% payment or 50% deposit via PayBox / crypto invoice required 7 days prior to broadcast/send date."
```

## Proposal reply template (drafted for owner approval)

```text
Subject: Re: Sponsorship Inquiry for {{publication_name}} — {{slot_name}}

Hi {{sponsor_contact_name}},

Thanks for reaching out to sponsor {{publication_name}}.

We have reviewed your inquiry and have slot availability for {{requested_dates}}.

Here are the details for the requested placement:
- Placement: {{slot_name}}
- Rate: {{rate_amount}} {{currency}}
- Creative Specs: {{creative_specs}}
- Material Deadline: {{material_deadline}}

Payment can be completed via our verified PayBox merchant address or bank invoice upon creative approval.

If these dates and terms align with your campaign goals, please let us know and we will reserve the slot on our calendar.

Best regards,
{{creator_signature}}
```

## Weekly pipeline digest (owner private summary)

```text
# Weekly Sponsorship Pipeline Digest

**Reporting Period:** {{start_date}} to {{end_date}}
**Active Mailbox:** {{mailbox_email}}

### Pipeline Summary
- New Inquiries Screened: {{total_inquiries}}
- Qualified & Drafted: {{qualified_count}}
- Awaiting Creator Send Approval: {{awaiting_approval_count}}
- Confirmed Bookings: {{confirmed_count}}
- Total Booked Revenue: {{confirmed_revenue}} {{currency}}
- Flagged Security / Spam: {{flagged_security_count}}

### Current Slot Status
- Next Available Newsletter Slot: {{next_newsletter_date}}
- Next Available Podcast Slot: {{next_podcast_date}}
```
