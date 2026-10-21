#!/usr/bin/env node
/**
 * Mermail Milestone Desk — Cryptographic Append-Only Receipt Ledger
 * Pure Node.js built-ins only (no external dependencies).
 */

import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

function sha256(data) {
  return createHash('sha256').update(String(data), 'utf8').digest('hex');
}

function computeEntryHash(entry) {
  const payload = [
    entry.index,
    entry.timestamp,
    entry.action,
    entry.milestoneId,
    JSON.stringify(entry.details),
    entry.prevHash
  ].join('::');
  return sha256(payload);
}

async function loadLedger(filePath) {
  try {
    const raw = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error('Ledger root must be a JSON array.');
    }
    return parsed;
  } catch (err) {
    if (err.code === 'ENOENT') {
      return [];
    }
    throw err;
  }
}

async function saveLedger(filePath, entries) {
  const dir = path.dirname(filePath);
  if (dir && dir !== '.') {
    await mkdir(dir, { recursive: true });
  }
  await writeFile(filePath, JSON.stringify(entries, null, 2) + '\n', 'utf8');
}

function verifyEntries(entries) {
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const expectedIndex = i + 1;
    if (entry.index !== expectedIndex) {
      return {
        valid: false,
        error: `Entry at index ${i} has invalid index property: ${entry.index} (expected ${expectedIndex})`
      };
    }

    const expectedPrevHash = i === 0 ? '0'.repeat(64) : entries[i - 1].entryHash;
    if (entry.prevHash !== expectedPrevHash) {
      return {
        valid: false,
        error: `Entry #${entry.index} prevHash mismatch. Expected ${expectedPrevHash}, found ${entry.prevHash}`
      };
    }

    const calculatedHash = computeEntryHash(entry);
    if (entry.entryHash !== calculatedHash) {
      return {
        valid: false,
        error: `Entry #${entry.index} hash mismatch. Computed ${calculatedHash}, stored ${entry.entryHash}`
      };
    }
  }

  return { valid: true, count: entries.length };
}

async function appendEntry(filePath, action, milestoneId, detailsJson) {
  const entries = await loadLedger(filePath);
  
  // Verify existing chain before appending
  const check = verifyEntries(entries);
  if (!check.valid) {
    throw new Error(`Cannot append to corrupted ledger: ${check.error}`);
  }

  let details;
  try {
    details = typeof detailsJson === 'string' ? JSON.parse(detailsJson) : detailsJson;
  } catch (err) {
    throw new Error(`Invalid JSON for details: ${err.message}`);
  }

  const index = entries.length + 1;
  const timestamp = new Date().toISOString();
  const prevHash = entries.length === 0 ? '0'.repeat(64) : entries[entries.length - 1].entryHash;

  const newEntry = {
    index,
    timestamp,
    action,
    milestoneId,
    details,
    prevHash
  };
  newEntry.entryHash = computeEntryHash(newEntry);

  entries.push(newEntry);
  await saveLedger(filePath, entries);

  return newEntry;
}

function printUsage() {
  console.log(`
Usage:
  node ledger.mjs append <ledgerPath> <action> <milestoneId> <detailsJson>
  node ledger.mjs verify <ledgerPath>
  node ledger.mjs summary <ledgerPath>
  `);
}

async function main() {
  const [,, command, ...args] = process.argv;

  try {
    switch (command) {
      case 'append': {
        const [filePath, action, milestoneId, detailsJson] = args;
        if (!filePath || !action || !milestoneId || !detailsJson) {
          throw new Error('append requires <ledgerPath> <action> <milestoneId> <detailsJson>');
        }
        const entry = await appendEntry(filePath, action, milestoneId, detailsJson);
        console.log(JSON.stringify({ status: 'appended', entry }, null, 2));
        break;
      }
      case 'verify': {
        const [filePath] = args;
        if (!filePath) throw new Error('verify requires <ledgerPath>');
        const entries = await loadLedger(filePath);
        const result = verifyEntries(entries);
        if (!result.valid) {
          console.error(`ERROR: Ledger verification failed — ${result.error}`);
          process.exit(1);
        }
        console.log(`✓ Ledger valid: ${result.count} entries verified. Latest hash: ${entries.length ? entries[entries.length - 1].entryHash : 'none'}`);
        break;
      }
      case 'summary': {
        const [filePath] = args;
        if (!filePath) throw new Error('summary requires <ledgerPath>');
        const entries = await loadLedger(filePath);
        console.log(`\n=== Milestone Receipt Ledger (${entries.length} records) ===`);
        for (const e of entries) {
          console.log(`[#${e.index}] ${e.timestamp} | ${e.action} | ${e.milestoneId} | hash: ${e.entryHash.slice(0, 12)}...`);
        }
        break;
      }
      default:
        printUsage();
        process.exit(1);
    }
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    process.exit(1);
  }
}

main();
