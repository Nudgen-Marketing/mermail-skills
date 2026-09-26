# Workflows — Base USDC EIP-681 invoice

## Constants (Base mainnet)

- Chain id: `8453`
- Native USDC: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- Decimals: `6`

## Amount

`amount_atomic = floor(usdc_decimal * 1_000_000)` as an integer string with no commas.

## EIP-681 transfer URI

```
ethereum:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913@8453/transfer?address=<PAYEE>&uint256=<AMOUNT_ATOMIC>
```

Replace `<PAYEE>` with the checksummed payee address and `<AMOUNT_ATOMIC>` with the integer minor units.

## Optional MetaMask mobile deeplink

```
https://metamask.app.link/send/0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913@8453/transfer?address=<PAYEE>&uint256=<AMOUNT_ATOMIC>
```

## Email body checklist

- Amount in USDC (human) and atomic units
- Payee address
- USDC contract + chain (Base)
- EIP-681 URI (plain text, one line)
- Optional MetaMask deeplink
- Memo / invoice id
- Explicit note: payer pays gas on Base; recipient does not need ETH to receive USDC
