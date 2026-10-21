#!/usr/bin/env node
/** Offline single-run payout reconciliation. No email/wallet/network calls.
 * node reconcile.js --claims claims.json --expected expected.csv --out report.json [--cap 10000]
 * CSV: claim_id,claimant_name,wallet_address,chain,amount,token
 * No durable journal: cross-run replay prevention remains author-blocked.
 */
'use strict';
const fs = require('node:fs');
const MAX_BYTES = 1024 * 1024;
const COLUMNS = ['claim_id', 'claimant_name', 'wallet_address', 'chain', 'amount', 'token'];
const TOKENS = new Set(['USDC', 'USDG', 'SOL']);
const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    if (!['--claims', '--expected', '--out', '--cap'].includes(key) ||
        Object.hasOwn(args, key.slice(2)) || typeof argv[i + 1] !== 'string' ||
        argv[i + 1].startsWith('--')) throw new Error('arguments');
    args[key.slice(2)] = argv[i + 1];
  }
  if (!args.claims || !args.expected || !args.out) throw new Error('arguments');
  return args;
}

function readBounded(path) {
  const fd = fs.openSync(path, 'r');
  try {
    if (!fs.fstatSync(fd).isFile()) throw new Error('input');
    const bytes = Buffer.alloc(MAX_BYTES + 1);
    let size = 0;
    while (size < bytes.length) {
      const count = fs.readSync(fd, bytes, size, bytes.length - size, null);
      if (!count) break;
      size += count;
    }
    if (size > MAX_BYTES) throw new Error('input size');
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, size));
  } finally { fs.closeSync(fd); }
}

// Strict CSV, including quoted cells/escaped quotes: never shift financial
// columns or silently overwrite duplicate headers or expected claim ids.
function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false, closed = false;
  const finishCell = () => { row.push(cell.trim()); cell = ''; closed = false; };
  const finishRow = () => { finishCell(); if (row.some(Boolean)) rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') { quoted = false; closed = true; }
      else cell += char;
    } else if (char === '"') {
      if (cell || closed) throw new Error('CSV quotes');
      quoted = true;
    } else if (char === ',') finishCell();
    else if (char === '\r' || char === '\n') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      finishRow();
    } else {
      if (closed && !/[ \t]/.test(char)) throw new Error('CSV trailing data');
      if (!closed) cell += char;
    }
  }
  if (quoted) throw new Error('CSV quotes');
  if (cell || row.length || closed) finishRow();
  const headers = rows.shift();
  if (!headers || headers.length !== COLUMNS.length ||
      new Set(headers).size !== headers.length || COLUMNS.some(key => !headers.includes(key)) ||
      rows.length === 0 || rows.length > 10000) throw new Error('CSV header or count');
  return rows.map(cells => {
    if (cells.length !== headers.length) throw new Error('CSV row shape');
    return Object.fromEntries(headers.map((key, index) => [key, cells[index]]));
  });
}

function validId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(id);
}

// Exact fixed-point units (18 fractional places), never Number/parseFloat.
function decimalUnits(value) {
  if (typeof value !== 'string' || value.length > 60 ||
      !/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,18})?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  const units = BigInt(whole) * 10n ** 18n + BigInt(fraction.padEnd(18, '0'));
  return units > 0n ? units : null;
}

function isSolana(address) {
  if (typeof address !== 'string' || address.length < 32 || address.length > 44) return false;
  let number = 0n;
  for (const char of address) {
    const digit = BASE58.indexOf(char);
    if (digit < 0) return false;
    number = number * 58n + BigInt(digit);
  }
  let size = 0;
  for (let remaining = number; remaining > 0n; remaining >>= 8n) size++;
  const leadingZeros = address.match(/^1*/)[0].length;
  return size + leadingZeros === 32;
}

function validateWallet(address, chain) {
  if (chain === 'solana') return isSolana(address);
  if (chain === 'evm') return typeof address === 'string' && /^0x[0-9a-fA-F]{40}$/.test(address);
  return false;
}

function reconcile(claims, expected, cap) {
  if (!Array.isArray(claims) || claims.length > 50 ||
      claims.some(c => c === null || typeof c !== 'object' || Array.isArray(c))) throw new Error('claims shape');
  const expectedById = new Map();
  for (const entry of expected) {
    const amount = decimalUnits(entry.amount);
    if (!validId(entry.claim_id) || expectedById.has(entry.claim_id) ||
        !validateWallet(entry.wallet_address, entry.chain) || !TOKENS.has(entry.token) ||
        amount === null || amount > cap) throw new Error('invalid or ambiguous expected list');
    expectedById.set(entry.claim_id, entry);
  }
  const counts = new Map();
  for (const claim of claims) if (validId(claim.claim_id)) counts.set(claim.claim_id, (counts.get(claim.claim_id) || 0) + 1);
  const report = { matched: [], amount_mismatch: [], unknown_claimant: [], duplicate_claim: [],
    invalid_wallet: [], invalid_claim: [], unverifiable_sender: [], injection_attempt: [] };
  const fields = c => ({ wallet: c.wallet_address, chain: c.chain, amount: c.amount, token: c.token });
  for (const claim of claims) {
    if (claim.sender_auth !== 'pass') { report.unverifiable_sender.push(claim); continue; }
    if (typeof claim.flags === 'string' && /injection attempt/i.test(claim.flags)) { report.injection_attempt.push(claim); continue; }
    const amount = decimalUnits(claim.amount);
    if (!validId(claim.claim_id) || !['solana', 'evm'].includes(claim.chain) ||
        !TOKENS.has(claim.token) || amount === null || amount > cap ||
        (claim.flags !== undefined && typeof claim.flags !== 'string')) {
      report.invalid_claim.push(claim); continue;
    }
    // Every occurrence of an in-run duplicate is held, including the first.
    if (counts.get(claim.claim_id) > 1) { report.duplicate_claim.push(claim); continue; }
    if (!validateWallet(claim.wallet_address, claim.chain)) { report.invalid_wallet.push(claim); continue; }
    const entry = expectedById.get(claim.claim_id);
    if (!entry) { report.unknown_claimant.push(claim); continue; }
    if (entry.chain === claim.chain && entry.wallet_address === claim.wallet_address &&
        decimalUnits(entry.amount) === amount && entry.token === claim.token) {
      report.matched.push({ claim_id: claim.claim_id, ...fields(claim) });
    } else {
      report.amount_mismatch.push({ claim_id: claim.claim_id, claimed: fields(claim), expected: fields(entry) });
    }
  }
  return { ...report, scope: { replay_protection: 'in_run_only', durable_replay_backend: 'blocked_author_implementation',
    cap_limit_in_18_decimal_units: String(cap), max_claims: 50, network_or_token_contract_verified: false, auto_actions: 0 } };
}

function main(argv = process.argv.slice(2)) {
  try {
    const args = parseArgs(argv);
    const cap = decimalUnits(args.cap === undefined ? '10000' : args.cap);
    if (cap === null) throw new Error('cap');
    const claims = JSON.parse(readBounded(args.claims));
    const expected = parseCsv(readBounded(args.expected));
    const report = reconcile(claims, expected, cap);
    report.scope.cap = args.cap === undefined ? '10000' : args.cap;
    // Never replace an existing report or either supplied input.
    fs.writeFileSync(args.out, JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    console.log(`Reconciled ${claims.length} claims. 0 auto-actions taken. Replay protection: in-run only; durable backend blocked.`);
    return 0;
  } catch {
    console.error('error: invalid arguments/input, ambiguous expected list, or unavailable new output path; no report written');
    return 2;
  }
}

if (require.main === module) process.exitCode = main();
module.exports = { decimalUnits, isSolana, parseCsv, reconcile };
