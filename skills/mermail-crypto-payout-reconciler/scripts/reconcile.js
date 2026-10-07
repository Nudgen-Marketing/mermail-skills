#!/usr/bin/env node
/**
 * mermail-crypto-payout-reconciler — deterministic offline reconciliation.
 * Matches extracted email claims (JSON) against the owner's expected payout list (CSV).
 * Zero dependencies. Never touches the network, a wallet, or email.
 *
 * Usage:
 *   node scripts/reconcile.js --claims claims.json --expected expected.csv --out report.json
 *
 * expected.csv columns: claim_id,claimant_name,wallet_address,chain,amount,token
 * claims.json: array of claim objects (see SKILL.md)
 */
const fs = require('fs');

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 2) out[argv[i].replace(/^--/, '')] = argv[i + 1];
  return out;
}

function parseCsv(text) {
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const cells = line.split(',').map(c => c.trim());
    const row = {};
    headers.forEach((h, i) => { row[h] = cells[i] || ''; });
    return row;
  });
}

function isSolana(addr) { return /^[1-9A-HJ-NP-Za-km-z]{44}$/.test(addr); }
function isEvm(addr) { return /^0x[0-9a-fA-F]{40}$/.test(addr); }

function validateWallet(addr, chain) {
  if (chain === 'solana') return isSolana(addr);
  if (chain === 'evm') return isEvm(addr);
  return false;
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.claims || !args.expected || !args.out) {
    console.error('Usage: node reconcile.js --claims claims.json --expected expected.csv --out report.json');
    process.exit(2);
  }
  const claims = JSON.parse(fs.readFileSync(args.claims, 'utf8'));
  const expected = parseCsv(fs.readFileSync(args.expected, 'utf8'));
  const expectedById = new Map(expected.map(e => [e.claim_id, e]));

  const seen = new Set();
  const report = { matched: [], amount_mismatch: [], unknown_claimant: [], duplicate_claim: [], invalid_wallet: [], unverifiable_sender: [], injection_attempt: [] };

  for (const c of claims) {
    if (c.sender_auth !== 'pass') { report.unverifiable_sender.push(c); continue; }
    if (/injection attempt/i.test(c.flags || '')) { report.injection_attempt.push(c); continue; }
    if (seen.has(c.claim_id)) { report.duplicate_claim.push(c); continue; }
    seen.add(c.claim_id);
    if (!validateWallet(c.wallet_address, c.chain)) { report.invalid_wallet.push(c); continue; }
    const exp = expectedById.get(c.claim_id);
    if (!exp) { report.unknown_claimant.push(c); continue; }
    if (exp.wallet_address === c.wallet_address && exp.amount === String(c.amount) && exp.token === c.token) {
      report.matched.push({ claim_id: c.claim_id, wallet: c.wallet_address, amount: c.amount, token: c.token });
    } else {
      report.amount_mismatch.push({ claim_id: c.claim_id, claimed: { wallet: c.wallet_address, amount: c.amount, token: c.token }, expected: { wallet: exp.wallet_address, amount: exp.amount, token: exp.token } });
    }
  }

  fs.writeFileSync(args.out, JSON.stringify(report, null, 2));

  const total = claims.length;
  const line = (k, v) => console.log(`  ${k.padEnd(20)} ${v}`);
  console.log(`\n🧾 Reconciliation report — ${total} claims processed`);
  Object.entries(report).forEach(([k, v]) => line(k, v.length));
  const ok = report.amount_mismatch.length + report.unknown_claimant.length + report.duplicate_claim.length + report.invalid_wallet.length + report.unverifiable_sender.length + report.injection_attempt.length;
  console.log(ok === 0 ? '\n✅ All claims matched. 0 auto-actions taken (by design).' : `\n⚠️  ${ok} claim(s) need owner review. 0 auto-actions taken (by design).`);
  console.log(`Report written to ${args.out}\n`);
}

main();
