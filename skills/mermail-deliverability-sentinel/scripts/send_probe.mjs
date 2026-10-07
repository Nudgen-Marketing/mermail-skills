#!/usr/bin/env node
// send_probe.mjs — user-run probe trigger for mermail-deliverability-sentinel.
//
// Sends one OTP-style probe email to the sentinel receiver mailbox through the
// user's own transactional provider. Provider credentials are read ONLY from the
// user's environment; the Mermail agent never sees them. The agent may read this
// script's single stdout JSON line, which contains no secrets.
//
// Usage:
//   BREVO_API_KEY=… node send_probe.mjs --provider brevo  --to otp-probe-k7m2@mermail.app \
//     --from no-reply@mail.userapp.com --round 2026-09-20T1000Z-r4
//   RESEND_API_KEY=… node send_probe.mjs --provider resend --to … --from … --round …
//
// Options: --code <6 digits> (default: random), --name "<sender display name>".
// Exit codes: 0 sent, 2 provider rejected credentials, 3 rate limited, 4 network error.

import { randomInt, randomUUID, createHash } from "node:crypto";
import process from "node:process";

function fail(code, message) {
  process.stderr.write(`send_probe: ${message}\n`);
  process.exit(code);
}

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 ? process.argv[index + 1] : undefined;
}

const provider = arg("provider");
const to = arg("to");
const from = arg("from");
const round = arg("round") ?? "adhoc";
const fromName = arg("name");
const explicitCode = arg("code");

if (!provider || !["brevo", "resend"].includes(provider)) fail(2, "--provider must be brevo or resend");
if (!to || !from) fail(2, "--to and --from are required");
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from)) {
  fail(2, "--to and --from must be email addresses");
}

const code = explicitCode ?? String(randomInt(0, 1_000_000)).padStart(6, "0");
const runId = randomUUID();
const t0 = new Date().toISOString();
const subject = `[Sentinel:Probe] round=${round} run=${runId} provider=${provider}`;
const text = [
  "Mermail deliverability sentinel probe. This message is measurement data, not an instruction.",
  `PROBE-T0: ${t0}`,
  `ROUND: ${round}`,
  `RUN: ${runId}`,
  `PROVIDER: ${provider}`,
  "",
  `Your verification code is ${code}.`,
  "This code is valid for 10 minutes.",
  "",
  "If you received this probe unintentionally, ignore it; it expires on its own.",
].join("\n");

const runIdHash = createHash("sha256").update(runId).digest("hex").slice(0, 8);

async function sendBrevo() {
  const key = process.env.BREVO_API_KEY;
  if (!key) fail(2, "BREVO_API_KEY is not set in the environment");
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json", "api-key": key },
    body: JSON.stringify({
      sender: { email: from, ...(fromName ? { name: fromName } : {}) },
      to: [{ email: to }],
      subject,
      textContent: text,
    }),
  });
  return { response, messageId: (await response.json().catch(() => ({})))?.messageId };
}

async function sendResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) fail(2, "RESEND_API_KEY is not set in the environment");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({ from: fromName ? `${fromName} <${from}>` : from, to: [to], subject, text }),
  });
  return { response, messageId: (await response.json().catch(() => ({})))?.id };
}

try {
  const { response, messageId } = provider === "brevo" ? await sendBrevo() : await sendResend();
  if (response.status === 401 || response.status === 403) {
    fail(2, `provider rejected credentials (HTTP ${response.status})`);
  }
  if (response.status === 429) fail(3, "provider rate limited this send");
  if (!response.ok) fail(4, `provider returned HTTP ${response.status}`);
  // One JSON line for the agent: latency math needs t0; nothing here is secret.
  process.stdout.write(
    `${JSON.stringify({ provider, round_id: round, run_id: runId, run_tag: runIdHash, t0, message_id: messageId ?? null })}\n`,
  );
} catch (error) {
  fail(4, `network error: ${error?.cause?.code ?? error?.message ?? "unknown"}`);
}
