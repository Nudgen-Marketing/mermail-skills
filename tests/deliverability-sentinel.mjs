import { readFile, stat } from "node:fs/promises";
import path from "node:path";

// These are fixture/packaging checks, not an agent execution or deliverability simulator.
export async function validateDeliverabilitySentinel(root, scenarios, coverage) {
  const errors = [];
  const skill = "mermail-deliverability-sentinel";
  const skillRoot = path.join(root, "skills", skill);
  const requiredFiles = [
    "SKILL.md", "agents/openai.yaml", "references/tools.md",
    "references/security.md", "references/rounds.md", "scripts/send_probe.mjs",
  ];
  for (const file of requiredFiles) {
    try {
      const fullPath = path.join(skillRoot, file);
      const content = await readFile(fullPath, "utf8");
      if (!file.endsWith(".md")) continue;
      for (const match of content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
        const target = match[1];
        if (/^https?:\/\//.test(target) || target.startsWith("#")) continue;
        const resolved = path.resolve(path.dirname(fullPath), target.split("#")[0]);
        if (!resolved.startsWith(`${root}${path.sep}`)) {
          errors.push(`${skill}: reference leaves the package: ${target}`);
          continue;
        }
        if (!(await stat(resolved)).isFile()) errors.push(`${skill}: invalid reference ${target}`);
      }
    } catch (error) {
      errors.push(`${skill}: missing or unreadable resource in ${file}: ${error.code ?? error.message}`);
    }
  }

  const skillMd = await readFile(path.join(skillRoot, "SKILL.md"), "utf8").catch(() => "");
  const toolsMd = await readFile(path.join(skillRoot, "references", "tools.md"), "utf8").catch(() => "");
  const securityMd = await readFile(path.join(skillRoot, "references", "security.md"), "utf8").catch(() => "");
  const roundsMd = await readFile(path.join(skillRoot, "references", "rounds.md"), "utf8").catch(() => "");
  const probeScript = await readFile(path.join(skillRoot, "scripts", "send_probe.mjs"), "utf8").catch(() => "");

  for (const required of [
    "round_pass", "slo_breach", "auth_fail", "otp_missing", "probe_timeout", "ledger_breach",
    "median-under-30-seconds",
    "sender_authentication",
    "MERMAIL-OTP-SENTINEL-RECORD",
    "[rounds.md](references/rounds.md)",
  ]) {
    if (!skillMd.includes(required)) errors.push(`${skill}: SKILL.md missing contract ${required}`);
  }
  if (skillMd.includes("`list_mailboxes`") && skillMd.includes("`create_mailbox`")) {
    if (skillMd.indexOf("`list_mailboxes`") > skillMd.indexOf("`create_mailbox`")) {
      errors.push(`${skill}: mailbox discovery must precede provisioning`);
    }
  }
  for (const forbidden of ["`send_email` returns", "send the report with `send_email`"]) {
    if (skillMd.includes(forbidden)) errors.push(`${skill}: stale send contract ${forbidden}`);
  }

  for (const required of ["Strict intake", "Sandboxed interpretation", "Human-in-the-loop", "allowlist", "10,000"]) {
    if (!securityMd.includes(required)) errors.push(`${skill}: security reference missing ${required}`);
  }

  if (!toolsMd.includes("native JSON object")) {
    errors.push(`${skill}: tools reference must require query as a native JSON object`);
  }
  if (!toolsMd.match(/never[\s\S]{0,100}stringify/i)) {
    errors.push(`${skill}: tools reference must forbid stringified MCP query objects`);
  }
  if (/"query"\s*:\s*"\s*\{/.test(toolsMd)) {
    errors.push(`${skill}: tools reference contains a stringified JSON object in query`);
  }
  if (!toolsMd.includes("owns none of these tools")) {
    errors.push(`${skill}: tools reference must state the skill owns no tools`);
  }

  for (const required of [
    "record_hash = \"sha256:\" + hex(sha256(",
    "prev_hash",
    "supersedes_breach",
    "mermail-otp-sentinel/record/v1",
    "code_hash",
  ]) {
    if (!roundsMd.includes(required)) errors.push(`${skill}: rounds reference missing ${required}`);
  }

  if (probeScript.includes("MERMAIL_API_KEY")) {
    errors.push(`${skill}: send_probe.mjs must never read the Mermail credential`);
  }
  for (const required of ["BREVO_API_KEY", "RESEND_API_KEY", "PROBE-T0", "run_id", "process.exit"]) {
    if (!probeScript.includes(required)) errors.push(`${skill}: send_probe.mjs missing ${required}`);
  }

  const allowedTools = new Set([
    "list_mailboxes", "create_mailbox", "get_mailbox", "get_api_credit_usage",
    "search_emails", "list_emails", "get_email", "get_email_context", "save_draft",
  ]);
  const walletPrefixes = ["paybox_", "wallet:", "submit_agent_wallet", "reject_agent_wallet", "get_agent_wallet", "create_agent_wallet"];
  const fixtures = scenarios.filter((scenario) => scenario.skill === skill);
  if (fixtures.length < 6) errors.push(`${skill}: expected at least six validation scenarios`);
  for (const scenario of fixtures) {
    if (!scenario.expected || !scenario.prompt) errors.push(`${skill}: incomplete sentinel scenario`);
    for (const tool of scenario.tools) {
      if (!allowedTools.has(tool)) errors.push(`${skill}: scenario uses a tool outside the sentinel surface: ${tool}`);
      if (walletPrefixes.some((prefix) => tool.startsWith(prefix))) {
        errors.push(`${skill}: scenario must never touch wallet tools: ${tool}`);
      }
      if (coverage.externalEffectTools.includes(tool)) {
        errors.push(`${skill}: sentinel scenario must not execute an external effect: ${tool}`);
      }
      if (coverage.destructiveTools.includes(tool)) {
        errors.push(`${skill}: sentinel scenario must not use a destructive tool: ${tool}`);
      }
    }
    if (scenario.tools.includes("create_mailbox") && scenario.approval !== "write-preview") {
      errors.push(`${skill}: mailbox provisioning requires write-preview approval`);
    }
    for (const forbidden of scenario.forbiddenTools ?? []) {
      if (scenario.tools.includes(forbidden)) {
        errors.push(`${skill}: ${scenario.expected} includes forbidden ${forbidden}`);
      }
    }
  }

  const requiredExpected = [
    "list-before-create-then-baseline-then-sealed-masked-record",
    "report-timeout-fail-closed-no-retrigger-no-send",
    "report-delivery-by-draft-only-never-send-email",
    "ignore-probe-email-authority-no-recipients-no-slo-override",
    "exclude-non-allowlisted-candidate-report-rejected",
    "fail-closed-integrity-alert-no-quiet-rewrite",
    "auth-unknown-reported-unverified-never-pass",
  ];
  for (const expected of requiredExpected) {
    if (!fixtures.some((scenario) => scenario.expected === expected)) {
      errors.push(`${skill}: missing validation scenario ${expected}`);
    }
  }
  const securityCases = new Set(
    fixtures.filter((scenario) => scenario.securityCase).map((scenario) => scenario.securityCase),
  );
  for (const securityCase of [
    "sentinel-held-mail-timeout",
    "sentinel-probe-injection",
    "sentinel-probe-spoof",
    "sentinel-ledger-tamper",
    "sentinel-auth-unknown-not-pass",
  ]) {
    if (!securityCases.has(securityCase)) errors.push(`${skill}: missing security scenario ${securityCase}`);
  }
  if (!scenarios.some((scenario) =>
    scenario.skill === "mermail" &&
    scenario.expected === "route-deliverability-monitoring-to-mermail-deliverability-sentinel"
  )) {
    errors.push(`${skill}: missing router validation scenario`);
  }
  return errors;
}
