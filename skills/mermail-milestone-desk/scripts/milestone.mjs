#!/usr/bin/env node
/**
 * Mermail Milestone Desk — Deterministic Milestone & Pricing Engine
 * Pure Node.js built-ins only (no external dependencies).
 */

import { createHash } from 'node:crypto';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

function sha256(data) {
  return createHash('sha256').update(String(data), 'utf8').digest('hex');
}

function parseDecimal(value, label, maxPlaces) {
  if (typeof value !== 'string') throw new Error(`${label} must be a decimal string`);
  const input = value.trim();
  if (input.length > 80 || !/^\d+(?:\.\d+)?$/.test(input)) {
    throw new Error(`Invalid ${label}: use a nonnegative plain decimal string`);
  }
  const [whole, fraction = ''] = input.split('.');
  if (fraction.length > maxPlaces) throw new Error(`${label} exceeds ${maxPlaces} decimal places`);
  return { units: BigInt(whole + fraction), places: fraction.length };
}

function toMicroUnits(amountUsd) {
  const amount = parseDecimal(amountUsd, 'USDC amount', 6);
  return amount.units * 10n ** BigInt(6 - amount.places);
}

function decimalMicro(units) {
  return `${units / 1000000n}.${String(units % 1000000n).padStart(6, '0')}`;
}

export function createMilestone(project, title, amountUsd, deliverableContent = '') {
  if (typeof project !== 'string' || typeof title !== 'string' || !project.trim() || !title.trim()) {
    throw new Error('Project name and milestone title are required.');
  }
  const micro = toMicroUnits(amountUsd);
  const exactAmount = decimalMicro(micro);
  // Sub-cent USDC prices have no exact integer-cent representation.
  const cents = micro % 10000n === 0n ? (micro / 10000n).toString() : null;
  
  const idEntropy = `${project.trim().toLowerCase()}::${title.trim().toLowerCase()}`;
  const milestoneId = `MST-${sha256(idEntropy).slice(0, 8).toUpperCase()}`;
  
  const termsEntropy = JSON.stringify({
    project: project.trim(),
    title: title.trim(),
    amountUsd: exactAmount,
    amountCents: cents,
    amountMicro: micro.toString()
  });
  const termsHash = sha256(termsEntropy);
  
  const isPrecomputedHash = /^[a-f0-9]{64}$/i.test(deliverableContent.trim());
  const deliverableHash = isPrecomputedHash ? deliverableContent.trim().toLowerCase() : sha256(deliverableContent || 'initial-scope');
  
  return {
    milestoneId,
    project: project.trim(),
    title: title.trim(),
    amountUsd: exactAmount,
    amountCents: cents,
    amountMicro: micro.toString(),
    termsHash,
    deliverableHash,
    createdAt: new Date().toISOString()
  };
}

export function calculateSplits(totalAmountUsd, percentagesCsv) {
  const totalMicro = toMicroUnits(totalAmountUsd);
  if (typeof percentagesCsv !== 'string') throw new Error('Percentages must be decimal strings separated by commas');
  const values = percentagesCsv.split(',');
  if (values.length > 1000) throw new Error('At most 1000 split recipients are supported');
  const percentages = values.map((value) => parseDecimal(value, 'percentage', 18));
  const places = Math.max(...percentages.map((percentage) => percentage.places));
  const weights = percentages.map((percentage) => percentage.units * 10n ** BigInt(places - percentage.places));
  const denominator = 100n * 10n ** BigInt(places);
  if (weights.reduce((sum, weight) => sum + weight, 0n) !== denominator) {
    throw new Error('Percentages must sum to exactly 100');
  }

  const allocation = weights.map((weight, index) => ({
    index,
    micro: totalMicro * weight / denominator,
    remainder: totalMicro * weight % denominator,
  }));
  let dust = totalMicro - allocation.reduce((sum, share) => sum + share.micro, 0n);
  // Allocate indivisible micro-units by largest exact remainder, then input order.
  const order = [...allocation].sort((a, b) => a.remainder === b.remainder
    ? a.index - b.index : a.remainder > b.remainder ? -1 : 1);
  for (const share of order) {
    if (dust === 0n) break;
    share.micro += 1n;
    dust -= 1n;
  }
  if (dust !== 0n || allocation.some((share) => share.micro < 0n)
      || allocation.reduce((sum, share) => sum + share.micro, 0n) !== totalMicro) {
    throw new Error('Invalid split allocation');
  }
  const splits = allocation.map((share, i) => ({
    shareIndex: i + 1,
    percentage: values[i].trim(),
    amountUsd: decimalMicro(share.micro),
    amountMicro: share.micro.toString(),
  }));

  return {
    totalUsd: decimalMicro(totalMicro),
    totalMicro: totalMicro.toString(),
    splits
  };
}

function printUsage() {
  console.log(`
Usage:
  node milestone.mjs create <projectName> <milestoneTitle> <amountUsd> [deliverableText]
  node milestone.mjs split <totalAmountUsd> <percentagesCsv>
  node milestone.mjs hash <text>
  `);
}

function main() {
  const [,, command, ...args] = process.argv;

  try {
    switch (command) {
      case 'create': {
        const [project, title, amountUsd, deliverable] = args;
        if (!project || !title || !amountUsd) {
          throw new Error('create requires <project> <title> <amountUsd>');
        }
        const result = createMilestone(project, title, amountUsd, deliverable);
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      case 'split': {
        const [totalAmountUsd, percentagesCsv] = args;
        if (!totalAmountUsd || !percentagesCsv) {
          throw new Error('split requires <totalAmountUsd> <percentagesCsv>');
        }
        const result = calculateSplits(totalAmountUsd, percentagesCsv);
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      case 'hash': {
        const text = args.join(' ');
        console.log(sha256(text));
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
