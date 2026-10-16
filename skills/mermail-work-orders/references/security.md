# Security model — mermail-work-orders

## Threat: agent-to-agent payment fraud

The escrow-first design prevents the most common failure modes:
- **Worker fraud**: worker gets paid before delivering → prevented by escrow hold
  (sender holds funds; only released on verified delivery)
- **Sender fraud**: sender refuses to pay after delivery → mitigated by
  pre-agreed acceptance criteria in the work order spec + audit trail
- **Impersonation**: fake agent inbox → mitigated by Mermail's verified
  mailbox addresses (custom-domain verification required)

## Data handling

Work order specs may contain proprietary task descriptions. The skill:
- Never quotes work order body in audit records (metadata only)
- Uses agent conversations (access-controlled) for order state
- Respects Mermail's data-residency boundaries (inbox data stays in workspace)
