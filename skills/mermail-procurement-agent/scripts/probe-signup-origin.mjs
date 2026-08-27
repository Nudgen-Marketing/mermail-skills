#!/usr/bin/env node
// Read-only Playwright probe for the browser leg of mermail-procurement-agent.
// Navigates to one frozen origin, lets it settle, and reports whether the page
// can be driven at all. Never fills a field, never clicks, never submits.
// Verdicts: renderable | blocked_hydration_wipe | origin_drift | http_error
import process from "node:process";
import { createRequire } from "node:module";

const target = process.argv[2];
if (!target) fail("usage: probe-signup-origin.mjs <frozen-origin-url> [settle-ms]");
const settleMs = Number(process.argv[3] ?? 8000);
const frozen = new URL(target);

let chromium;
try {
  ({ chromium } = createRequire(import.meta.url)("playwright"));
} catch {
  fail("playwright is not resolvable from this directory; install it or set NODE_PATH. The probe does not guess.");
}

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext()).newPage();
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(String(error).slice(0, 200)));

let status = null;
try {
  const response = await page.goto(frozen.href, { waitUntil: "domcontentloaded", timeout: 60000 });
  status = response?.status() ?? null;
} catch (error) {
  await browser.close();
  report({ verdict: "http_error", status, detail: String(error).slice(0, 200) });
}
await page.waitForTimeout(settleMs);

const landed = new URL(page.url());
const body = await page
  .evaluate(() => ({
    bodyNull: document.body === null,
    childCount: document.body?.childElementCount ?? 0,
    documentLength: document.documentElement?.outerHTML.length ?? 0,
  }))
  .catch(() => ({ bodyNull: true, childCount: 0, documentLength: 0 }));
await browser.close();

// ponytail: registrable-domain check is "same host or a subdomain of the frozen host";
// swap in a public-suffix list if a vendor ever signs up on a sibling subdomain.
const sameOrigin =
  landed.hostname === frozen.hostname || landed.hostname.endsWith(`.${frozen.hostname}`);

let verdict = "renderable";
if (status === null || status >= 400) verdict = "http_error";
else if (!sameOrigin) verdict = "origin_drift";
else if ((body.bodyNull || body.childCount === 0) && body.documentLength > 0) verdict = "blocked_hydration_wipe";

report({ verdict, status, frozen: frozen.href, landed: landed.href, body, pageErrors });

function report(result) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.verdict === "renderable" ? 0 : 2);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
