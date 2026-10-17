# Output templates

## Evidence packet

```text
Payment request review
Source: <mailbox / message / received time>
Sender: <actual address>
Sender authentication: <pass / fail / unknown>
Spend authority: <owner policy / not established>
Purpose: <owner-supplied purpose>
Invoice/order: <id>
Requested: <amount> <asset> on <network>
Destination: <full value for owner review; fingerprint in logs>
Trusted comparison: <owner-supplied record>
Discrepancies: <none or exact list>
Wallet readiness: <connected / action required / unavailable>, <sufficient / insufficient / unknown>
Verdict: <ready_for_owner_review / needs_clarification / blocked / declined>
Effect: <none / would_call tool / separately authorized real write>
No payment has been made.
```

## Exact transfer preview

```text
Approve one Agent Wallet transfer?
Amount: <amount> <asset>
Network: <network>
Destination: <destination>
Purpose: <invoice and vendor>
Network fee: <live amount or unknown>
Source records: <message id + trusted record>
On approval: call paybox_request_transfer once. A submitted or signature-pending result is not settlement.
```

## Exact x402 preview

```text
Approve one x402 payment?
Origin: <https origin>
Resource/action: <exact path or operation>
Live quote: <amount>
Documented prepaid floor: <amount + source>
Required charge: <greater of quote and floor>
Maximum approved spend: <cap>
On approval: call paybox_pay_x402 once and continue only with this resource/action.
```

## Final receipt

```text
Payment status: <pending signature / submitted / settled / failed / rejected / uncertain>
Provider request: <id>
Amount: <amount> <asset>
Network: <network>
Destination fingerprint: <fingerprint>
Time: <timestamp>
Remaining action: <none / sign in first-party handoff / clarify / contact provider>
Vendor reply: <not drafted / draft ready / separately approved and sent>
```
