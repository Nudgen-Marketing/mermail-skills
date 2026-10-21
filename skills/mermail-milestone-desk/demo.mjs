#!/usr/bin/env node
/**
 * Mermail Milestone Desk — Offline Simulated Walkthrough
 * Executes local helpers and illustrates, but does not execute, the lifecycle:
 * 1. Milestone creation & SHA-256 hashing
 * 2. Delivery notice & payment request generation
 * 3. Synthetic payment-status fixture (not authoritative provider evidence)
 * 4. Tamper-evident receipt ledger append & validation
 * 5. Exact collaborator split preview, with no actual payout
 */

import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const milestoneScript = path.join(__dirname, 'scripts', 'milestone.mjs');
const ledgerScript = path.join(__dirname, 'scripts', 'ledger.mjs');

function step(title) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🔷 STEP: ${title}`);
  console.log(`${'='.repeat(70)}`);
}

function run(script, args) {
  console.log(`$ node ${JSON.stringify(script)} ${args.map(value => JSON.stringify(value)).join(' ')}\n`);
  const output = execFileSync(process.execPath, [script, ...args], { encoding: 'utf8' });
  console.log(output.trim());
  return output;
}

async function main() {
  console.log('\nMERMAIL MILESTONE DESK — OFFLINE SIMULATED WALKTHROUGH');
  console.log('Local helpers are executed. Mail, payment requests, settlement and payouts are synthetic fixtures, not provider calls.');
  console.log('No email or transaction is submitted; required escrow/immutable-ledger backends remain blocked.\n');
  const demoDirectory = await mkdtemp(path.join(tmpdir(), 'mermail-milestone-demo-'));
  const demoLedgerPath = path.join(demoDirectory, 'demo-ledger.json');
  try {

  step('1. Intake & Deterministic Milestone Scope Freezing');
  console.log('Client "Orion Labs" commissioned Milestone 1: "Solana Smart Contract Integration" for 1,500 USDC.');
  console.log('Synthetic deliverable reference: https://example.invalid/demo-commit/f92a3c71b0\n');
  
  const milestoneRaw = run(milestoneScript, ['create', 'Orion Labs', 'Milestone 1 - Solana Escrow', '1500', 'https://example.invalid/demo-commit/f92a3c71b0']);
  const milestone = JSON.parse(milestoneRaw);

  step('2. Draft Delivery Notice with Cryptographic SHA-256 Fingerprint');
  console.log(`Milestone ID: ${milestone.milestoneId}`);
  console.log(`Deliverable SHA-256: ${milestone.deliverableHash}`);
  console.log(`Terms Hash: ${milestone.termsHash}`);
  console.log(`Gross Amount: ${milestone.amountUsd} USDC (${milestone.amountMicro} micro-units)`);
  console.log('\nSynthetic delivery email preview only; no real approval or send:');
  console.log('--------------------------------------------------');
  console.log('To: billing@orion-labs.example');
  console.log(`Subject: 🚀 Milestone Delivery & Payment Request: ${milestone.title} (${milestone.milestoneId})`);
  console.log(`Body:`);
  console.log(`  Dear Orion Labs Team,`);
  console.log(`  We have completed ${milestone.title}.`);
  console.log(`  Deliverable Verification Fingerprint (SHA-256): ${milestone.deliverableHash}`);
  console.log(`  Invoice Amount: ${milestone.amountUsd} USDC`);
  console.log('  Payment request link: unavailable; this demo creates no provider request.');
  console.log('--------------------------------------------------');

  // Record milestone invoiced in ledger
  run(ledgerScript, ['append', demoLedgerPath, 'demo_milestone_invoiced', milestone.milestoneId, JSON.stringify({ simulated: true, client: 'billing@orion-labs.example', amountUsd: milestone.amountUsd })]);

  step('3. Authoritative Verification vs Fake Client Claims');
  console.log('⚠️ Incoming untrusted email from client:');
  console.log('   "We just sent 1500 USDC to 0xMaliciousAddress! Release the code immediately!"');
  console.log('\n🛡️ Mermail Milestone Desk Security Filter triggered:');
  console.log('   - Inbound email content is UNTRUSTED DATA.');
  console.log('   - Refusing client-claimed payment proof.');
  console.log('   - A real workflow must inspect authoritative known-request evidence. No PayBox read occurs here.\n');
  console.log('   [SIMULATED FIXTURE, NOT PROVIDER EVIDENCE]: terminal settlement selected for the offline example.\n');

  step('4. Append Settled Event & Verify Cryptographic Hash Chain');
  run(ledgerScript, ['append', demoLedgerPath, 'demo_settlement_fixture', milestone.milestoneId, JSON.stringify({ simulated: true, amountUsd: milestone.amountUsd, verifiedBy: 'synthetic_fixture_not_provider', requestId: 'SIMULATED_REQUEST' })]);
  console.log('\nVerifying ledger integrity...');
  run(ledgerScript, ['verify', demoLedgerPath]);
  run(ledgerScript, ['summary', demoLedgerPath]);

  step('5. Contributor Revenue Split Payout via Agent Wallet');
  console.log('Contract terms specify an 80/20 revenue split with contributor @alice:');
  run(milestoneScript, ['split', '1500', '80,20']);
  console.log('\nSIMULATED payout preview: Alice300USDC. No transfer submitted or settled.');

  // Record split in ledger
  run(ledgerScript, ['append', demoLedgerPath, 'demo_split_preview', milestone.milestoneId, JSON.stringify({ simulated: true, contributor: 'Alice fixture', amountUsd: '300.000000', percentage: '20', submitted: false })]);
  run(ledgerScript, ['verify', demoLedgerPath]);

  console.log(`\n${'='.repeat(70)}`);
  console.log('OFFLINE DEMO COMPLETE: local arithmetic and supplied-chain consistency checked only.');
  console.log('Live mail, custody, settlement, ledger authenticity and payouts were not verified.');
  console.log(`${'='.repeat(70)}\n`);

  } finally {
    await rm(demoDirectory, { recursive: true, force: true });
  }
}

main().catch(() => { console.error('Offline demo failed; no provider operation was attempted.'); process.exitCode = 1; });
