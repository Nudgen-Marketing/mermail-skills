import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verdict, isoTime, usd, ledgerLine, parseLedger, mergeLedger, bestPair, check, args, evidence,
  PRICE_ORIGIN, EVIDENCE_ORIGIN, QUOTE_MINTS } from "../skills/mermail-exit-desk/scripts/exit-verdict.mjs";

const mint = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
const openedAt = "2026-10-21T00:00:00Z", now = "2026-10-21T01:00:00Z";
const position = { entryUsd: "0.05", peakUsd: "0.1", tookHalf: true, liquidityUsd: 5000, openedAt, now };
const pool = (price = "0.07", liquidity = 5000) => ({ chainId: "solana", baseToken: { address: mint, symbol: "DEMO" },
  quoteToken: { address: Object.keys(QUOTE_MINTS)[0] }, priceUsd: price, liquidity: { usd: liquidity } });
const selected = { mint, entryUsd: "0.05", openedAt, now };
const json = body => new Response(JSON.stringify(body));

test("evidence timestamps cannot normalize impossible dates into full coverage", () => {
  const lens = { known: true, token: { created_at: "2026-02-30T00:00:00Z" }, as_of: "2026-02-30T01:00:00Z", base_rates: { since_hours: 1 } };
  const invalid = evidence(lens, { pair_created_at: "2026-03-02T00:00:00Z" });
  assert.equal(invalid.coverage, "partial");
  assert.equal(invalid.as_of, null); assert.equal(invalid.base_rates_from, null);
  const valid = evidence({ ...lens, token: { created_at: openedAt }, as_of: now }, { pair_created_at: openedAt });
  assert.equal(valid.coverage, "full"); assert.equal(valid.as_of, "2026-10-21T01:00:00.000Z");
  assert.equal(evidence({ ...lens, token: { created_at: openedAt } }, { pair_created_at: "2026-02-30T00:00:00Z" }).coverage, "partial");
});

test("ledger producer rejects coerced sale state or a substituted malformed mint", () => {
  const row = { mint, entryUsd: "1", openedAt, peakUsd: "2", tookHalf: false, observedAt: now, priceUsd: "1.4" };
  for (const tookHalf of ["false", "true", 0, 1, null, undefined]) assert.throws(() => ledgerLine({ ...row, tookHalf }));
  assert.throws(() => ledgerLine({ ...row, mint: "unverified\nledger" }));
  assert.equal(parseLedger(ledgerLine(row), mint)[0].tookHalf, false);
});
async function withFetch(fake, run) {
  const original = globalThis.fetch;
  globalThis.fetch = fake;
  try { return await run(); } finally { globalThis.fetch = original; }
}

test("exact small-price 30-percent trailing boundary fires, without display-driven decisions", () => {
  for (const priceUsd of ["0.06999999999999999999", "0.07"]) {
    const result = verdict({ ...position, priceUsd });
    assert.equal(result.status, "exit_now"); assert.equal(result.levels.trail_usd, 0.07);
  }
  assert.equal(verdict({ ...position, priceUsd: "0.07000000000000000001" }).status, "hold");
});

test("exact arm, cut, double and liquidity boundaries retain original rule precedence", () => {
  assert.equal(verdict({ ...position, entryUsd: "0.1", peakUsd: "0.13", priceUsd: "0.091" }).status, "exit_now");
  assert.equal(verdict({ ...position, entryUsd: "0.1", peakUsd: "0.12999999999999999999", priceUsd: "0.09" }).status, "hold");
  assert.equal(verdict({ ...position, entryUsd: "0.1", peakUsd: "0.1", priceUsd: "0.05" }).status, "cut");
  assert.equal(verdict({ ...position, entryUsd: "0.1", peakUsd: "0.1", priceUsd: "0.05000000000000000001" }).status, "hold");
  assert.equal(verdict({ ...position, entryUsd: "0.1", priceUsd: "0.19999999999999999999", tookHalf: false }).status, "hold");
  assert.equal(verdict({ ...position, entryUsd: "0.1", priceUsd: "0.2", tookHalf: false }).status, "take_half");
  assert.equal(verdict({ ...position, priceUsd: "0.2", tookHalf: false, liquidityUsd: 999 }).status, "exit_rug");
});

test("bounded plain decimals retain old numeric compatibility but reject malformed prices", () => {
  assert.equal(usd(2, "price"), 2); assert.equal(usd(1e-9, "price"), 1e-9);
  for (const value of ["1e-9", "0x10", "-1", "0", "NaN", "10.0.99", "1".repeat(801), {}, null])
    assert.throws(() => usd(value, "price"));
  const huge = verdict({ ...position, entryUsd: "1000000000000000000000000000000.1", peakUsd: undefined,
    priceUsd: "2000000000000000000000000000000.2", tookHalf: false });
  assert.equal(huge.status, "take_half");
});

test("strict local calendar rejects rollover dates/times and keeps valid zones/leap dates", () => {
  for (const value of ["2026-02-30T00:00:00Z", "2026-02-29T00:00:00Z", "2026-04-31T00:00:00Z",
    "2026-10-21T24:00:00Z", "2026-10-21T00:60:00Z", "2026-10-21T00:00:60Z", "2026-10-21T00:00:00+14:01",
    "2026-10-21T00:00:00.0001Z", new Date(NaN)]) assert.throws(() => isoTime(value, "time"));
  assert.equal(isoTime("2028-02-29T23:30:00-05:30", "time").toISOString(), "2028-03-01T05:00:00.000Z");
  assert.equal(isoTime("2026-10-21T14:05+05:30", "time").toISOString(), "2026-10-21T08:35:00.000Z");
});

test("ledger serialization is lossless and entry identity is exact, not tolerance-based", () => {
  const row = { mint, entryUsd: "1.0000000000000000001", openedAt, peakUsd: "2.0000000000000000002",
    tookHalf: true, observedAt: now, priceUsd: "1.40000000000000000014" };
  const line = ledgerLine(row), rows = parseLedger(line, mint);
  assert.ok(line.includes("entry_usd=1.0000000000000000001"));
  assert.equal(mergeLedger(rows, { entryUsd: row.entryUsd, openedAt, now }).peakExact, row.peakUsd);
  assert.equal(mergeLedger(rows, { entryUsd: "1", openedAt, now }).rowsUsed, 0);
  const close = parseLedger(ledgerLine({ ...row, entryUsd: "1.0000000005" }), mint);
  assert.equal(mergeLedger(close, { entryUsd: "1", openedAt, now }).tookHalf, false);
  assert.equal(mergeLedger(rows, { entryUsd: "1.00000000000000000010", openedAt, now }).rowsUsed, 1);
});

test("invalid/future ledger observations cannot become current memory; excessive text fails closed", () => {
  const row = { mint, entryUsd: "1", openedAt, peakUsd: "2", tookHalf: true, observedAt: now, priceUsd: "1.4" };
  const line = ledgerLine(row);
  assert.equal(parseLedger(line.replace("2026-10-21T01:00:00.000Z", "2026-02-30T01:00:00.000Z"), mint).length, 0);
  assert.equal(mergeLedger(parseLedger(line, mint), { entryUsd: "1", openedAt, now: openedAt }).rowsUsed, 0);
  assert.throws(() => parseLedger("x".repeat(60001), mint));
});

test("pool comparison preserves exact source prices and accepts the exact ten-percent boundary", () => {
  const result = bestPair({ pairs: [pool("1.1", 6000), pool("1", 5000)] }, mint);
  assert.equal(result.price_usd_exact, "1.1");
  assert.throws(() => bestPair({ pairs: [pool("1.10000000000000000001", 6000), pool("1", 5000)] }, mint), /disagree/);
  assert.equal(bestPair({ pairs: [pool("1e2")] }, mint), null);
});

test("library evidence optout makes zero evidence calls and preserves a useful price verdict", async () => {
  const calls = [];
  await withFetch(async (url, options) => {
    calls.push(String(url)); assert.equal(options.redirect, "error"); assert.equal(options.credentials, "omit");
    assert.equal(new URL(url).origin, PRICE_ORIGIN); return json({ pairs: [pool()] });
  }, async () => {
    const result = await check({ ...selected, includeEvidence: false });
    assert.equal(result.status, "hold"); assert.match(result.evidence.note, /declined/);
    assert.equal(calls.length, 1);
  });
});

test("default evidence call remains useful and malformed optout/input never fetches", async () => {
  const calls = [];
  await withFetch(async url => { calls.push(String(url)); return String(url).startsWith(PRICE_ORIGIN)
    ? json({ pairs: [pool()] }) : json({ known: false }); }, async () => {
    const result = await check(selected); assert.equal(result.evidence.coverage, "none");
    assert.equal(calls.length, 2); assert.ok(calls[1].startsWith(EVIDENCE_ORIGIN));
    for (const patch of [{ includeEvidence: "false" }, { tookHalf: "false" }, { openedAt: "2026-02-30T00:00:00Z" }, { entryUsd: "1e-3" }])
      await assert.rejects(check({ ...selected, ...patch }));
    assert.equal(calls.length, 2);
  });
});

test("redirected responses and oversized declared/streamed input fail before JSON interpretation", async () => {
  for (const response of [
    { ok: true, redirected: true, body: null },
    { ok: true, redirected: false, url: "https://other.example.test/data", body: null },
    new Response("{}", { headers: { "content-length": "40001" } }),
    new Response("x".repeat(40001)),
    new Response(JSON.stringify({ pairs: [pool()], padding: "x".repeat(10001) })),
    new Response(new Uint8Array([0xff, 0xff])),
  ]) await withFetch(async () => response, async () => { await assert.rejects(check({ ...selected, includeEvidence: false })); });
});

test("oversized optional evidence is unavailable, not a failed valid price check", async () => {
  await withFetch(async url => String(url).startsWith(PRICE_ORIGIN) ? json({ pairs: [pool()] })
    : new Response("x".repeat(40001)), async () => {
    const result = await check(selected); assert.equal(result.status, "hold"); assert.equal(result.evidence.coverage, "unavailable");
  });
});

test("stream bounds cancel before consuming the remaining source; excessive pool arrays fail closed", async () => {
  let cancelled = false;
  const stream = new ReadableStream({ start(controller) {
    controller.enqueue(new Uint8Array(20_000)); controller.enqueue(new Uint8Array(20_001));
  }, cancel() { cancelled = true; } });
  await withFetch(async () => new Response(stream), async () => {
    await assert.rejects(check({ ...selected, includeEvidence: false }), /bounds/);
    assert.equal(cancelled, true);
  });
  assert.throws(() => bestPair({ pairs: Array(1001).fill(pool()) }, mint), /bounded/);
  for (const invalid of ["", false, -1, "-1", "NaN"]) {
    assert.equal(bestPair({ pairs: [pool("0.07", invalid)] }, mint).liquidity_usd, null);
  }
});

test("actual CLI skip-evidence flag requests only the fixed price source; bad local input never fetches", () => {
  const script = fileURLToPath(new URL("../skills/mermail-exit-desk/scripts/exit-verdict.mjs", import.meta.url));
  const preload = `const calls=[];globalThis.fetch=async(url,options)=>{calls.push(String(url));if(new URL(url).origin!==${JSON.stringify(PRICE_ORIGIN)}||options.redirect!=="error")throw Error("unexpected source");return new Response(${JSON.stringify(JSON.stringify({ pairs: [pool()] }))});};process.on("exit",()=>process.stderr.write(JSON.stringify(calls)));`;
  const flags = ["--import", "data:text/javascript," + encodeURIComponent(preload), script, "--mint", mint,
    "--entry-usd", "0.05", "--opened-at", openedAt, "--now", now, "--skip-evidence"];
  const result = spawnSync(process.execPath, flags, { encoding: "utf8", env: { PATH: process.env.PATH } });
  assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(result.stderr).length, 1);
  assert.match(JSON.parse(result.stdout).evidence.note, /declined/);
  assert.throws(() => args(["--mint", mint, "--entry-usd", "1", "--opened-at", openedAt, "--skip-evidence", "--skip-evidence"]));
  const temp = mkdtempSync(path.join(tmpdir(), "exit-desk-bounds-"));
  try {
    const file = path.join(temp, "memos.txt"); writeFileSync(file, "x".repeat(240001));
    const bad = spawnSync(process.execPath, [...flags, "--ledger-file", file], { encoding: "utf8", env: { PATH: process.env.PATH } });
    assert.equal(bad.status, 1); assert.deepEqual(JSON.parse(bad.stderr), []);
    for (const body of ["x".repeat(60001), new Uint8Array([0xff])]) {
      writeFileSync(file, body);
      const invalid = spawnSync(process.execPath, [...flags, "--ledger-file", file], { encoding: "utf8", env: { PATH: process.env.PATH } });
      assert.equal(invalid.status, 1); assert.deepEqual(JSON.parse(invalid.stderr), []);
    }
    writeFileSync(file, ledgerLine({ ...selected, peakUsd: "0.1", tookHalf: true, observedAt: now, priceUsd: "0.07" }));
    const useful = spawnSync(process.execPath, [...flags, "--ledger-file", file], { encoding: "utf8", env: { PATH: process.env.PATH } });
    assert.equal(useful.status, 0, useful.stdout); assert.equal(JSON.parse(useful.stdout).status, "exit_now");
    assert.equal(JSON.parse(useful.stdout).memory.rows_used, 1); assert.equal(JSON.parse(useful.stderr).length, 1);
    const link = path.join(temp, "link.txt"); symlinkSync(file, link);
    const linked = spawnSync(process.execPath, [...flags, "--ledger-file", link], { encoding: "utf8", env: { PATH: process.env.PATH } });
    assert.equal(linked.status, 1); assert.deepEqual(JSON.parse(linked.stderr), []);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});
