#!/usr/bin/env node
/**
 * Mermail Milestone Desk — Deterministic Milestone & Pricing Engine
 * Pure Node.js built-ins only (no external dependencies).
 */

import { createHash } from 'node:crypto';
import process from 'node:process';

function sha256(data) {
  return createHash('sha256').update(String(data), 'utf8').digest('hex');
}

function toMicroUnits(amountUsd) {
  const num = Number(amountUsd);
  if (isNaN(num) || num < 0) {
    throw new Error(`Invalid USD amount: ${amountUsd}`);
  }
  return BigInt(Math.round(num * 1e6));
}

function createMilestone(project, title, amountUsd, deliverableContent = '') {
  if (!project || !title) {
    throw new Error('Project name and milestone title are required.');
  }
  const micro = toMicroUnits(amountUsd);
  const cents = Math.round(Number(amountUsd) * 100);
  
  const idEntropy = `${project.trim().toLowerCase()}::${title.trim().toLowerCase()}`;
  const milestoneId = `MST-${sha256(idEntropy).slice(0, 8).toUpperCase()}`;
  
  const termsEntropy = JSON.stringify({
    project: project.trim(),
    title: title.trim(),
    amountUsd: Number(amountUsd),
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
    amountUsd: Number(amountUsd),
    amountCents: cents,
    amountMicro: micro.toString(),
    termsHash,
    deliverableHash,
    createdAt: new Date().toISOString()
  };
}

function calculateSplits(totalAmountUsd, percentagesCsv) {
  const totalMicro = toMicroUnits(totalAmountUsd);
  const percentages = percentagesCsv.split(',').map((p) => {
    const val = Number(p.trim());
    if (isNaN(val) || val <= 0) throw new Error(`Invalid percentage: ${p}`);
    return val;
  });

  const percentSum = percentages.reduce((a, b) => a + b, 0);
  if (Math.abs(percentSum - 100) > 0.001) {
    throw new Error(`Percentages must sum to 100, got ${percentSum}`);
  }

  let allocatedMicro = 0n;
  const splits = [];

  for (let i = 0; i < percentages.length; i++) {
    const pct = percentages[i];
    let shareMicro;
    if (i === percentages.length - 1) {
      // Last split gets remaining dust so total is exact
      shareMicro = totalMicro - allocatedMicro;
    } else {
      shareMicro = (totalMicro * BigInt(Math.round(pct * 1000))) / 100000n;
      allocatedMicro += shareMicro;
    }

    const shareUsd = Number(shareMicro) / 1e6;
    splits.push({
      shareIndex: i + 1,
      percentage: pct,
      amountUsd: shareUsd,
      amountMicro: shareMicro.toString()
    });
  }

  return {
    totalUsd: Number(totalAmountUsd),
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

main();
