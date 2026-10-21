#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { verifyMarginPacket } from "./build-margin-packet.mjs";

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const result = { input: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--input") result.input = argv[++index];
    else if (arg === "--help" || arg === "-h") result.help = true;
    else fail(`unknown argument ${arg}`);
  }
  if (!result.help && !result.input) fail("--input is required");
  return result;
}

async function readStdin() {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  return input;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write("Usage: verify-margin-packet.mjs --input <file|->\n");
    return;
  }

  const raw = args.input === "-" ? await readStdin() : await readFile(args.input, "utf8");
  const result = verifyMarginPacket(JSON.parse(raw));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.valid) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`Freelance Margin Guard verification: ${error.message}\n`);
    process.exitCode = 1;
  });
}
