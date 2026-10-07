#!/usr/bin/env node
// Read-only repository scanner for mermail-deprecation-radar.
// Maps "notice records" extracted from vendor email to concrete code locations.
// No dependencies, no network, never executes repository code, never writes files.
//
// Usage:
//   node scan-repo.mjs --signals notices.json [--root .] [--max-hits 200] [--json]
//   node scan-repo.mjs --self-test
//
// notices.json shape:
// {
//   "notices": [
//     {
//       "id": "jupiter-lite-api",
//       "vendor": "Jupiter",
//       "effective": "2026-10-31",          // ISO date or null when the notice gives none
//       "status": "claimed",                 // claimed | corroborated
//       "signals": [
//         { "type": "literal", "value": "lite-api.jup.ag" },
//         { "type": "regex", "value": "hermes\\.pyth\\.network" },
//         { "type": "package", "value": "@pythnetwork/hermes-client", "below": "2.0.0" }
//       ]
//     }
//   ]
// }

import { readFile, readdir, stat, mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import process from "node:process";

const SKIP_DIRS = new Set([".git", "node_modules", "dist", "build", "out", ".next", "target", "vendor", ".venv", "venv", "__pycache__", "coverage", ".turbo", ".cache"]);
const TEXT_EXT = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".json", ".py", ".rs", ".go", ".java", ".kt", ".rb", ".php", ".cs", ".swift", ".toml", ".yaml", ".yml", ".env.example", ".md", ".sh", ".sol", ".move", ".html", ".vue", ".svelte", ".txt", ".cfg", ".ini"]);
const MAX_FILE_BYTES = 1024 * 1024;
const SECRET_PATTERNS = [
  /(?:api[_-]?key|secret|token|authorization|bearer|password)\s*[:=]\s*["'`]?[A-Za-z0-9_\-./+=]{12,}/gi,
  /\b(?:sk|pk|jup|ghp|gho|xox[abp])[_-][A-Za-z0-9_-]{16,}\b/g,
  /\b[1-9A-HJ-NP-Za-km-z]{64,88}\b/g, // base58 blobs that look like Solana secret keys
];

function parseArgs(argv) {
  const args = { root: ".", maxHits: 200, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--signals") args.signals = argv[++i];
    else if (a === "--root") args.root = argv[++i];
    else if (a === "--max-hits") args.maxHits = Number(argv[++i]);
    else if (a === "--json") args.json = true;
    else if (a === "--self-test") args.selfTest = true;
    else throw new Error(`unknown argument ${a}`);
  }
  return args;
}

export function redact(line) {
  let out = line;
  for (const re of SECRET_PATTERNS) out = out.replace(re, "[REDACTED]");
  return out.length > 200 ? `${out.slice(0, 197)}...` : out;
}

function isTextFile(file) {
  const base = path.basename(file);
  if (base === "package.json" || base === "Cargo.toml" || base === "requirements.txt" || base === "pyproject.toml" || base === ".env.example") return true;
  return TEXT_EXT.has(path.extname(file).toLowerCase());
}

async function* walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) continue; // never follow links out of the repo
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* walk(full);
    } else if (entry.isFile() && isTextFile(full)) {
      yield full;
    }
  }
}

function compareSemver(a, b) {
  const pa = String(a).replace(/^[^0-9]*/, "").split(/[.+-]/).map((n) => Number.parseInt(n, 10) || 0);
  const pb = String(b).replace(/^[^0-9]*/, "").split(/[.+-]/).map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i += 1) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  }
  return 0;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compileSignal(signal) {
  if (signal.type === "literal") return new RegExp(escapeRegex(signal.value), "g");
  if (signal.type === "regex") {
    if (signal.value.length > 200) throw new Error("regex signal too long");
    return new RegExp(signal.value, "g");
  }
  if (signal.type === "package") return new RegExp(`["'\`]${escapeRegex(signal.value)}["'\`/]`, "g");
  throw new Error(`unsupported signal type ${signal.type}`);
}

export function urgency(effective, today = new Date()) {
  if (!effective) return "unknown-date";
  const days = Math.floor((new Date(`${effective}T00:00:00Z`) - today) / 86400000);
  if (Number.isNaN(days)) return "unknown-date";
  if (days < 0) return "past-due";
  if (days <= 14) return "due-within-14-days";
  if (days <= 60) return "due-within-60-days";
  return "later";
}

export async function scan(root, notices, maxHits = 200, today = new Date()) {
  const compiled = notices.map((n) => ({
    notice: n,
    signals: (n.signals ?? []).map((s) => ({ signal: s, re: compileSignal(s) })),
    hits: [],
    packageFindings: [],
  }));
  let total = 0;
  let filesScanned = 0;
  for await (const file of walk(root)) {
    const info = await stat(file);
    if (info.size > MAX_FILE_BYTES) continue;
    filesScanned += 1;
    const text = await readFile(file, "utf8");
    const rel = path.relative(root, file);
    const lines = text.split(/\r?\n/);
    if (path.basename(file) === "package.json") {
      let pkg = null;
      try { pkg = JSON.parse(text); } catch { pkg = null; }
      if (pkg) {
        for (const c of compiled) {
          for (const { signal } of c.signals) {
            if (signal.type !== "package") continue;
            for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
              const range = pkg[field]?.[signal.value];
              if (!range) continue;
              const affected = signal.below ? compareSemver(range, signal.below) < 0 : true;
              c.packageFindings.push({ file: rel, field, package: signal.value, range, below: signal.below ?? null, affected });
            }
          }
        }
      }
    }
    for (let i = 0; i < lines.length; i += 1) {
      for (const c of compiled) {
        for (const { signal, re } of c.signals) {
          re.lastIndex = 0;
          if (!re.test(lines[i])) continue;
          if (total >= maxHits) continue;
          c.hits.push({ file: rel, line: i + 1, signal: signal.value, text: redact(lines[i].trim()) });
          total += 1;
        }
      }
    }
  }
  return {
    root: path.resolve(root),
    filesScanned,
    truncated: total >= maxHits,
    notices: compiled
      .map((c) => ({
        id: c.notice.id,
        vendor: c.notice.vendor ?? null,
        effective: c.notice.effective ?? null,
        status: c.notice.status ?? "claimed",
        urgency: urgency(c.notice.effective, today),
        hitCount: c.hits.length,
        files: [...new Set(c.hits.map((h) => h.file))].length,
        packageFindings: c.packageFindings,
        hits: c.hits,
      }))
      .sort((a, b) => order(a.urgency) - order(b.urgency) || b.hitCount - a.hitCount),
  };
}

function order(u) {
  return ["past-due", "due-within-14-days", "due-within-60-days", "later", "unknown-date"].indexOf(u);
}

function printHuman(result) {
  console.log(`Scanned ${result.filesScanned} files under ${result.root}${result.truncated ? " (hit cap reached; results truncated)" : ""}`);
  for (const n of result.notices) {
    console.log(`\n[${n.urgency}] ${n.vendor ?? n.id} (${n.id}) effective=${n.effective ?? "unknown"} status=${n.status}`);
    if (!n.hitCount && !n.packageFindings.length) {
      console.log("  no references found in this repository");
      continue;
    }
    for (const p of n.packageFindings) {
      console.log(`  package ${p.package}@${p.range} in ${p.file} (${p.field})${p.below ? ` affected-below-${p.below}=${p.affected}` : ""}`);
    }
    for (const h of n.hits) console.log(`  ${h.file}:${h.line}  [${h.signal}]  ${h.text}`);
  }
}

async function selfTest() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "deprecation-radar-"));
  try {
    await mkdir(path.join(dir, "src"));
    await mkdir(path.join(dir, "node_modules", "x"), { recursive: true });
    await writeFile(path.join(dir, "src", "price.ts"), [
      'const BASE = "https://lite-api.jup.ag/price/v3";',
      'const HERMES = "https://hermes.pyth.network/v2/updates/price/latest";',
      'const apiKey = "jup_abcdefghijklmnopqrstuvwxyz123456";',
    ].join("\n"));
    await writeFile(path.join(dir, "node_modules", "x", "index.js"), 'fetch("https://lite-api.jup.ag/x")');
    await writeFile(path.join(dir, "package.json"), JSON.stringify({ dependencies: { "@pythnetwork/hermes-client": "^1.3.0" } }));
    const result = await scan(dir, [
      { id: "jup", vendor: "Jupiter", effective: "2026-01-01", signals: [{ type: "literal", value: "lite-api.jup.ag" }] },
      { id: "pyth", vendor: "Pyth", effective: null, signals: [{ type: "literal", value: "hermes.pyth.network" }, { type: "package", value: "@pythnetwork/hermes-client", below: "2.0.0" }] },
      { id: "none", vendor: "Nobody", effective: "2099-01-01", signals: [{ type: "literal", value: "api.example.invalid" }] },
      { id: "secret", vendor: "Secret", effective: null, signals: [{ type: "literal", value: "apiKey" }] },
    ], 50, new Date("2026-10-04T00:00:00Z"));
    const by = Object.fromEntries(result.notices.map((n) => [n.id, n]));
    const checks = [
      ["skips node_modules", by.jup.hitCount === 1],
      ["past-due urgency", by.jup.urgency === "past-due"],
      ["unknown date urgency", by.pyth.urgency === "unknown-date"],
      ["package range flagged", by.pyth.packageFindings.length === 1 && by.pyth.packageFindings[0].affected === true],
      ["zero-hit notice reported", by.none.hitCount === 0 && by.none.urgency === "later"],
      ["secret redacted", by.secret.hits.length === 1 && !by.secret.hits[0].text.includes("abcdefghijklmnop")],
      ["sorted by urgency", result.notices[0].id === "jup"],
    ];
    let failed = 0;
    for (const [name, ok] of checks) {
      console.log(`${ok ? "ok  " : "FAIL"} ${name}`);
      if (!ok) failed += 1;
    }
    if (failed) process.exit(1);
    console.log(`self-test passed (${checks.length} checks)`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const args = parseArgs(process.argv.slice(2));
if (args.selfTest) {
  await selfTest();
} else {
  if (!args.signals) throw new Error("--signals is required");
  const parsed = JSON.parse(await readFile(args.signals, "utf8"));
  const result = await scan(args.root, parsed.notices ?? [], args.maxHits);
  if (args.json) console.log(JSON.stringify(result, null, 2));
  else printHuman(result);
}
