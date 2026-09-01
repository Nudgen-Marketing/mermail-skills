#!/usr/bin/env node
/**
 * Smoke test for mermail-newsletter-brief skill.
 * Simulates the skill workflow:
 *   1. List mailboxes
 *   2. Search for newsletter-like emails
 *   3. Read each newsletter body
 *   4. Extract key updates
 *   5. Compile a brief
 *   6. (Preview only) Create a custom label and mark as read
 *
 * Usage: MERMAIL_API_KEY=<your-key> node scripts/smoke-test-newsletter-brief.mjs
 */

const MCP_URL = "https://console.mermail.app/mcp";
const API_KEY = process.env.MERMAIL_API_KEY;

if (!API_KEY) {
  console.error("Error: MERMAIL_API_KEY environment variable is required");
  process.exit(1);
}

const headers = {
  "Content-Type": "application/json",
  "Accept": "application/json, text/event-stream",
  "x-api-key": API_KEY,
};

let reqId = 0;

async function mcpCall(tool, args = {}) {
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: ++reqId,
      method: "tools/call",
      params: { name: tool, arguments: args },
    }),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    const m = text.match(/data: ({.*})/);
    data = m ? JSON.parse(m[1]) : { raw: text };
  }
  if (data.error) {
    console.error(`  [MCP error] ${tool}:`, JSON.stringify(data.error));
    return null;
  }
  // Prefer structuredContent if available (direct object), otherwise parse text
  if (data.result?.structuredContent) {
    return data.result.structuredContent;
  }
  const contentText = data.result?.content?.[0]?.text;
  if (contentText) {
    try {
      return JSON.parse(contentText);
    } catch {
      return contentText;
    }
  }
  return data.result;
}

async function init() {
  // Initialize MCP session
  const initRes = await fetch(MCP_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 0,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "newsletter-brief-smoke-test", version: "1.0" },
      },
    }),
  });
  const initText = await initRes.text();
  let initData;
  try { initData = JSON.parse(initText); } catch {
    const m = initText.match(/data: ({.*})/);
    initData = m ? JSON.parse(m[1]) : {};
  }
  console.log(`Connected to ${initData.result?.serverInfo?.name || "MCP server"} v${initData.result?.serverInfo?.version || "?"}`);

  // Send initialized notification
  await fetch(MCP_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
  });
}

async function runSkillWorkflow() {
  console.log("\n" + "=".repeat(70));
  console.log("  Mermail Newsletter Brief — Smoke Test");
  console.log("=".repeat(70) + "\n");

  // Step 1: Resolve mailbox
  console.log("Step 1: Resolve mailbox");
  const mailboxes = await mcpCall("list_mailboxes", {});
  const mailbox = Array.isArray(mailboxes) ? mailboxes[0] : mailboxes?.items?.[0];
  if (!mailbox) {
    console.error("  No mailbox found!");
    return;
  }
  const mailboxId = mailbox.public_id || mailbox.id;
  console.log(`  Mailbox: ${mailbox.email} (public_id: ${mailboxId})`);
  console.log(`  Status: ${mailbox.receiving_status || mailbox.status || "unknown"}`);

  // Step 2: Search for newsletter candidates
  console.log("\nStep 2: Discover newsletter candidates");
  const searchResults = await mcpCall("search_emails", {
    mailboxId,
    query: {
      folder: "sent", // Our test newsletters are in Sent (self-send)
      limit: 10,
      sortColumn: "date",
      sortDirection: "DESC",
      metadata_only: true,
      agent_safe_content: true,
    },
  });

  const allEmails = searchResults?.emails || searchResults || [];
  if (!Array.isArray(allEmails)) {
    console.error("  Unexpected search results format:", JSON.stringify(searchResults).substring(0, 200));
    return;
  }

  // Filter for newsletter-like subjects
  const newsletterKeywords = ["issue", "weekly", "daily", "digest", "周报", "newsletter", "#"];
  const newsletters = allEmails.filter((e) => {
    const subj = (e.subject || "").toLowerCase();
    return newsletterKeywords.some((kw) => subj.includes(kw));
  });

  console.log(`  Found ${allEmails.length} emails, ${newsletters.length} match newsletter patterns:`);
  newsletters.forEach((n, i) => {
    console.log(`    ${i + 1}. ${n.subject?.substring(0, 70)}`);
    console.log(`       ID: ${n.id} | Date: ${n.date?.substring(0, 19)}`);
  });

  if (newsletters.length === 0) {
    console.log("  No newsletters found. Send test emails first.");
    return;
  }

  // Step 3: Read each newsletter body
  console.log("\nStep 3: Read newsletter bodies (bounded, safe)");
  const briefEntries = [];

  for (const nl of newsletters) {
    console.log(`\n  Reading: ${nl.subject?.substring(0, 60)}`);
    const email = await mcpCall("get_email", {
      mailboxId,
      emailId: nl.id,
      query: {
        agent_safe_content: true,
        max_body_chars: 10000,
      },
    });

    if (!email) {
      console.log("    [skipped: could not read]");
      briefEntries.push({
        subject: nl.subject,
        sourceId: nl.id,
        status: "unreadable",
      });
      continue;
    }

    const body = email.body || email.text || email.html || "";
    const scanStatus = email.scan_status || "unknown";
    console.log(`    scan_status: ${scanStatus}`);
    console.log(`    body length: ${body.length} chars`);

    if (scanStatus === "flagged" || email.content_omitted) {
      console.log("    [partially read — content omitted by safety filter]");
      briefEntries.push({
        subject: nl.subject,
        sourceId: nl.id,
        status: "partially_read",
      });
      continue;
    }

    // Step 4: Extract key updates (simulated agent reasoning)
    console.log("    Extracting key updates...");
    const keyUpdates = extractKeyUpdates(body, nl.subject);
    console.log(`    Extracted ${keyUpdates.length} key updates`);

    briefEntries.push({
      subject: nl.subject,
      sourceId: nl.id,
      date: nl.date,
      scanStatus,
      bodyLength: body.length,
      keyUpdates,
      status: "processed",
    });
  }

  // Step 5: Compile the brief
  console.log("\n" + "=".repeat(70));
  console.log("  NEWSLETTER BRIEF");
  console.log("=".repeat(70) + "\n");

  console.log(`Digest window: recent sent mail`);
  console.log(`Newsletters found: ${briefEntries.length}`);
  console.log(`Processed: ${briefEntries.filter((e) => e.status === "processed").length}`);
  console.log(`Partially read: ${briefEntries.filter((e) => e.status === "partially_read").length}`);
  console.log(`Unreadable: ${briefEntries.filter((e) => e.status === "unreadable").length}`);
  console.log();

  for (const entry of briefEntries) {
    console.log(`--- ${entry.subject} ---`);
    console.log(`  Source: email ID ${entry.sourceId}`);
    console.log(`  Date: ${entry.date?.substring(0, 19) || "unknown"}`);
    if (entry.keyUpdates && entry.keyUpdates.length > 0) {
      console.log(`  Key updates:`);
      entry.keyUpdates.forEach((u, i) => {
        console.log(`    ${i + 1}. ${u}`);
      });
    } else if (entry.status !== "processed") {
      console.log(`  Status: ${entry.status}`);
    }
    console.log();
  }

  // Step 6: Preview organization (label creation)
  console.log("=".repeat(70));
  console.log("  Organization Preview (no writes executed)");
  console.log("=".repeat(70) + "\n");

  const existingLabels = await mcpCall("list_custom_labels", { mailboxId });
  const labelArray = Array.isArray(existingLabels) ? existingLabels : existingLabels?.items || [];
  const hasLabel = labelArray.some((l) => l.name === "Newsletter-Digested");

  if (hasLabel) {
    console.log('  Custom label "Newsletter-Digested" already exists — skipping creation.');
  } else {
    console.log('  Would create custom label: "Newsletter-Digested"');
    console.log('    Rules: "Messages from recurring subscription senders processed into a periodic brief"');
    console.log('    Color: #4A90D9');
  }

  const emailIds = briefEntries.map((e) => e.sourceId);
  console.log(`\n  Would mark ${emailIds.length} newsletters as read: ${emailIds.join(", ")}`);
  console.log(`  Would move to Archive folder: ${emailIds.join(", ")}`);
  console.log("\n  [Preview only — no writes executed in smoke test]");

  console.log("\n" + "=".repeat(70));
  console.log("  Smoke test complete.");
  console.log("=".repeat(70));
}

/**
 * Simple key-update extraction (simulates agent reasoning).
 * Extracts numbered list items from newsletter body.
 */
function extractKeyUpdates(body, subject) {
  const updates = [];
  const lines = body.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    // Match numbered list items: "1. ", "2. ", etc.
    const match = trimmed.match(/^(\d+)\.\s+(.+)/);
    if (match && match[2].length > 10) {
      // Truncate to first sentence or 200 chars
      const text = match[2];
      const firstSentence = text.split(/[.!。]/)[0];
      updates.push(firstSentence.length > 200 ? firstSentence.substring(0, 200) + "..." : firstSentence);
    }
    if (updates.length >= 4) break;
  }

  return updates;
}

// Run
init()
  .then(() => runSkillWorkflow())
  .catch((e) => {
    console.error("Fatal error:", e.message);
    process.exit(1);
  });
