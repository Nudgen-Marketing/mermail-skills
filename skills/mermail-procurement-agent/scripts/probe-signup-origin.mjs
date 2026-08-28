#!/usr/bin/env node
// Read-only Playwright probe for the browser leg of mermail-procurement-agent.
// Navigates to one frozen origin, lets it settle, and reports (a) whether the
// page can be driven at all and (b) which human-only steps the form demands.
// Never fills a field, never clicks, never submits.
// Verdicts: renderable | blocked_hydration_wipe | origin_drift | http_error
// PROBE_BROWSER=chromium|firefox|webkit selects the engine (default chromium);
// the engine is echoed in the report so the record says what was actually tried.
import process from "node:process";
import { createRequire } from "node:module";

const target = process.argv[2];
if (!target) fail("usage: probe-signup-origin.mjs <frozen-origin-url> [settle-ms]");
const settleMs = Number(process.argv[3] ?? 8000);
const frozen = new URL(target);
const engine = process.env.PROBE_BROWSER ?? "chromium";

let playwright;
try {
  playwright = createRequire(import.meta.url)("playwright");
} catch {
  fail("playwright is not resolvable from this directory; install it or set NODE_PATH. The probe does not guess.");
}
if (!playwright[engine]) fail(`PROBE_BROWSER must be chromium, firefox, or webkit; got ${engine}`);

const browser = await playwright[engine].launch({ headless: true });
const page = await (await browser.newContext()).newPage();
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(String(error).slice(0, 200)));

let status = null;
try {
  const response = await page.goto(frozen.href, { waitUntil: "domcontentloaded", timeout: 60000 });
  status = response?.status() ?? null;
} catch (error) {
  await browser.close();
  report({ verdict: "http_error", engine, status, detail: String(error).slice(0, 200) });
}
await page.waitForTimeout(settleMs);

const landed = new URL(page.url());
const inspected = await page
  .evaluate(() => {
    const body = document.body;
    const q = (selector) => document.querySelectorAll(selector).length;
    const text = (body?.innerText ?? "").toLowerCase();
    return {
      bodyNull: body === null,
      childCount: body?.childElementCount ?? 0,
      textLength: text.length,
      interactive: q("input, button, a[href], textarea, select"),
      documentLength: document.documentElement?.outerHTML.length ?? 0,
      // Every entry below is a human step under browser.md; the model never supplies it.
      form: {
        emailFields: q('input[type="email"], input[name*="email" i], input[autocomplete="email"]'),
        passwordFields: q('input[type="password"]'),
        cardFields: q('input[autocomplete^="cc-"], input[name*="card" i], iframe[src*="stripe" i], iframe[name^="__privateStripe"]'),
        captcha: q('iframe[src*="recaptcha" i], iframe[src*="hcaptcha" i], iframe[src*="turnstile" i], [data-sitekey], .g-recaptcha, .h-captcha, .cf-turnstile'),
        consentCheckboxes: q('input[type="checkbox"]'),
        mentionsTerms: /terms|privacy policy|agree/.test(text),
        oauthOnly: q('input[type="email"], input[type="password"]') === 0 && /continue with|sign in with|log in with/.test(text),
      },
    };
  })
  .catch(() => ({ bodyNull: true, childCount: 0, textLength: 0, interactive: 0, documentLength: 0, form: null }));
await browser.close();

// ponytail: registrable-domain check is "same host or a subdomain of the frozen host";
// swap in a public-suffix list if a vendor ever signs up on a sibling subdomain.
const sameOrigin =
  landed.hostname === frozen.hostname || landed.hostname.endsWith(`.${frozen.hostname}`);

let verdict = "renderable";
if (status === null || status >= 400) verdict = "http_error";
else if (!sameOrigin) verdict = "origin_drift";
else if ((inspected.bodyNull || inspected.childCount === 0) && inspected.documentLength > 0) {
  verdict = "blocked_hydration_wipe";
}

const { form, ...body } = inspected;
const humanSteps = [];
if (form?.passwordFields) humanSteps.push("password");
if (form?.cardFields) humanSteps.push("card");
if (form?.captcha) humanSteps.push("captcha");
if (form?.consentCheckboxes || form?.mentionsTerms) humanSteps.push("consent");
if (form?.oauthOnly) humanSteps.push("third-party-login");

report({ verdict, engine, status, frozen: frozen.href, landed: landed.href, body, form, humanSteps, pageErrors });

function report(result) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.verdict === "renderable" ? 0 : 2);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
