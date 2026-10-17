# Solana & Anchor Static Security Analysis Rules

## Rule 1: Missing Signer Constraint (Severity: HIGH)
- **Pattern**: Using raw `AccountInfo<'info>` for accounts intended to hold authority, ownership, or administration privileges without checking `is_signer` or using Anchor's `Signer<'info>`.
- **Impact**: Any arbitrary caller can pass their own or an innocent user's public key as the authority, executing privileged actions without permission.
- **Remediation**: Declare the account as `pub authority: Signer<'info>` or enforce `require!(ctx.accounts.authority.is_signer, ErrorCode::Unauthorized)`.

## Rule 2: Unchecked PDA Derivation in CPI (Severity: CRITICAL)
- **Pattern**: Calling `invoke_signed` with static or unverified seed slices instead of deriving canonical seeds using `find_program_address`.
- **Impact**: Attacker can spoof program derived authority or bypass access control gates.
- **Remediation**: Use Anchor's `seeds = [...]` constraint with `bump` validation on account structs.

## Rule 3: Unverified External CPI Target (Severity: MEDIUM)
- **Pattern**: Invoking instructions against an account passed as a generic `AccountInfo` without asserting its program ID matches the expected system, token, or protocol address.
- **Impact**: Attacker substitutes a malicious mock program that returns successful exit codes while performing unexpected state changes.
- **Remediation**: Use typed Anchor Program accounts, e.g. `Program<'info, Token>` or verify `require_keys_eq!(program.key(), expected_id)`.

## Rule 4: Insecure Account Closure (Severity: LOW)
- **Pattern**: Manually reallocating lamports to zero without clearing the account discriminator and data payload.
- **Impact**: Account can be revived within the same transaction or block (resurrection attack).
- **Remediation**: Use Anchor's `#[account(close = target)]` macro, which automatically zeroes the 8-byte discriminator.
