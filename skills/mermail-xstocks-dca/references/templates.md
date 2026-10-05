# Templates

## Mandate

```json
{
  "schema": "mermail-xstocks-dca/mandate@1",
  "owner": { "email": "<owner address from the user>" },
  "mailbox": { "publicId": "<public_id from list_mailboxes>", "email": "<desk mailbox address>" },
  "wallet": { "credentialId": "<credential_id>", "address": "<Solana wallet address>", "network": "solana" },
  "legs": [
    { "symbol": "SPYx", "productId": "cmugraxb700pu1ws5p1n2y3nj", "mint": "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W", "sliceUsdc": "0.25" },
    { "symbol": "NVDAx", "productId": "cmugr89b700k51ws5xkdw5ivi", "mint": "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh", "sliceUsdc": "0.25" }
  ],
  "cadence": { "every": "P1D", "anchor": "2026-10-06T14:00:00Z" },
  "caps": { "perSliceUsdc": "0.50", "window": { "duration": "P7D", "maxUsdc": "3.50" }, "totalUsdc": "7.00" },
  "guards": { "maxSlippageBps": 100 },
  "reports": { "statementEvery": "P7D" },
  "validFrom": "2026-10-06T14:00:00Z",
  "expiresAt": "2026-10-20T14:00:00Z"
}
```

The product ids and mints above are the catalog's SPYx and NVDAx on Solana at the time of writing; always re-resolve them through the catalog.

Rules the engine enforces (`dca check` lists every violation):

- Money is a decimal string with at most 6 fractional digits. Numbers are rejected.
- 1 to 5 legs, unique mints, never the USDC mint. Each `sliceUsdc` ≤ `perSliceUsdc`.
- The sum of one tick's slices ≤ `window.maxUsdc` ≤ `totalUsdc`.
- Durations: `PnD`, `PTnH`, `PTnM` or combinations such as `P1DT12H`; at least one minute.
- Instants are ISO-8601 with an explicit zone (`Z` or `+02:00`); `validFrom` < `expiresAt`.
- `maxSlippageBps` is an integer from 1 to 1000; keep it at or below the wallet grant's `max_slippage_bps`.
- No other top-level fields. The mandate id is the SHA-256 of its canonical JSON, so key order does not matter and any change of value makes a new mandate.

## Emails

Every email is rendered by `dca outbox`; send it unchanged. Subjects are ASCII and end with `#<shortId>`, which is also how owner replies are matched.

Mandate ticket:

```text
Subject: [Standing Order] Mandate active: SPYx, NVDAx #d9eb83c3

- Standing order active: 0.25 USDC of SPYx + 0.25 USDC of NVDAx every PT3M, up to 1.50 USDC per P1D and 2.00 USDC in total, slippage guard 100 bps, valid until 2026-10-07T10:00:00Z. Receipts go to owner@example.com.

Reply PAUSE or STOP to halt this desk. A reply can never resume it, raise a limit or change an asset; only your agent session can.
```

Fill receipt:

```text
Subject: [Standing Order] Filled SPYx #d9eb83c3

- Order submitted for SPYx (slot 0); waiting for settlement.
- Filled SPYx: 0.25 USDC -> 0.00031979 SPYx raw units (before the xStocks multiplier), tx 5LrQLr...G7rZJC https://solscan.io/tx/5LrQLr2J4rNttraS4Q29T3yfQDJjvNbKFyaurV37QquNS3eSB6t6Vdts4V21r1G493EuTmtLjRi1kgAZcQG7rZJC

Budget: spent 0.25 USDC, in flight 0 USDC, window left 1.25 USDC, total left 1.75 USDC.
```

Refusal:

```text
Subject: [Standing Order] Refused NVDAx: cap_window #d9eb83c3

- Refused NVDAx (slot 1): the rolling spending window is full.
```

Escalation alert:

```text
Subject: [Standing Order] Ignored an email that tried to change your mandate #d9eb83c3

- Ignored an email that asked to resume. Email can only pause or stop this desk; changes need your agent session.
```

Statement:

```text
Subject: [Standing Order] Statement: PnL -0.0008 USD #d9eb83c3

Statement as of 2026-10-06T10:06:00.000Z
SPYx: 1 fills, invested 0.25 USDC, 0.00032161 shares (multiplier 1.005714560286254), avg cost 777.3209 USD, mark 0.2492 USD, PnL -0.0008 USD (-0.32%)
NVDAx: 0 fills, invested 0 USDC, 0 shares (multiplier 1), avg cost n/a USD, mark 0 USD, PnL 0 USD (n/a%)
Total: invested 0.25 USDC, mark 0.2492 USD, PnL -0.0008 USD (-0.32%)
Marks are the Agent Wallet portfolio value of each holding, prorated to what this desk bought. This is an activity record, not a brokerage confirmation or investment advice.
```

The HTML part carries the same lines, a statement table and the same records.

## Ledger records

Each email ends with the records it reports, one fenced block per record:

````text
```mermail-dca-ledger
{"at":"2026-10-06T10:01:00.000Z","data":{"amountInRaw":"250000","amountOutRaw":"31979","blockTime":1791231170,"decimals":8,"mint":"Xso…F2W","symbol":"SPYx","tx":"5LrQ…ZJC"},"hash":"…","kind":"filled","leg":0,"prev":"…","schema":"mermail-xstocks-dca/ledger@1","seq":3,"slot":0}
```
````

- One canonical JSON object per block, keys sorted. `hash = sha256(canonical(record without hash))`, `prev` = the previous record's hash, `seq` counts from 0.
- Record 0 (`genesis`) carries the mandate id and the mandate itself, so the Sent folder alone can restore a desk with `dca rebuild`.
- Kinds: `genesis`, `intent`, `submitted`, `filled`, `failed`, `uncertain`, `refused`, `skipped`, `paused`, `resumed`, `revoked`, `control_seen`, `escalation_ignored`, `statement`.
