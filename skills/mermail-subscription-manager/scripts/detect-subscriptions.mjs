#!/usr/bin/env node
/**
 * detect-subscriptions.mjs
 *
 * Deterministic recurring-charge detector for the
 * mermail-subscription-manager skill.
 *
 * Takes a list of emails (as pulled from mermail-manage-inbox search
 * results) and groups them by sender + amount, then flags any group
 * that repeats with a roughly regular interval as a likely
 * subscription. This exists so the skill doesn't have to rely purely
 * on model judgement each run — the matching logic is deterministic
 * and testable.
 *
 * USAGE (CLI):
 *   node detect-subscriptions.mjs emails.json
 *
 * USAGE (as a module, e.g. called by the agent/skill runtime):
 *   import { detectSubscriptions } from "./detect-subscriptions.mjs";
 *   const results = detectSubscriptions(emails);
 *
 * INPUT SHAPE (array of email objects):
 *   [
 *     {
 *       "from": "billing@streamlyplus.example",
 *       "subject": "Your Streamly Plus payment receipt — June 2026",
 *       "body": "...Amount: $9.99...Billing date: June 3, 2026...",
 *       "date": "2026-06-03"
 *     },
 *     ...
 *   ]
 *
 * `date` should be ISO-ish (YYYY-MM-DD) or any string Date.parse()
 * can handle. If `amount` is not provided directly on the object, the
 * script tries to extract a dollar amount from subject+body.
 *
 * OUTPUT SHAPE:
 *   [
 *     {
 *       sender: "billing@streamlyplus.example",
 *       amount: 9.99,
 *       occurrences: 4,
 *       cadenceDays: 30,
 *       cadenceLabel: "monthly",
 *       firstChargeDate: "2026-06-03",
 *       lastChargeDate: "2026-09-01",
 *       nextExpectedDate: "2026-10-01",
 *       confidence: "high",
 *       emails: [ ...original matched email objects... ]
 *     }
 *   ]
 */

const AMOUNT_REGEX = /\$\s?(\d{1,5}(?:\.\d{2})?)/;

// Cadence buckets, in days, with a tolerance window for "close enough".
const CADENCES = [
  { label: "weekly", days: 7, tolerance: 2 },
  { label: "biweekly", days: 14, tolerance: 3 },
  { label: "monthly", days: 30, tolerance: 5 },
  { label: "quarterly", days: 91, tolerance: 10 },
  { label: "annual", days: 365, tolerance: 15 },
];

/**
 * Pull a dollar amount out of subject/body text if not already present
 * as a structured field on the email object.
 */
function extractAmount(email) {
  if (typeof email.amount === "number") return email.amount;

  const haystack = `${email.subject || ""} ${email.body || ""}`;
  const match = haystack.match(AMOUNT_REGEX);
  return match ? parseFloat(match[1]) : null;
}

/**
 * Normalize a sender address for grouping — lowercase, strip display
 * name, keep just the email portion if present.
 */
function normalizeSender(from) {
  if (!from) return "unknown";
  const emailMatch = from.match(/<([^>]+)>/);
  const raw = emailMatch ? emailMatch[1] : from;
  return raw.trim().toLowerCase();
}

/**
 * Classify a list of day-gaps into a cadence label, or null if the
 * gaps aren't consistent enough to call it recurring.
 */
function classifyCadence(gapsDays) {
  if (gapsDays.length === 0) return null;

  const avgGap = gapsDays.reduce((a, b) => a + b, 0) / gapsDays.length;

  for (const cadence of CADENCES) {
    const withinTolerance = gapsDays.every(
      (gap) => Math.abs(gap - cadence.days) <= cadence.tolerance
    );
    if (withinTolerance) {
      return { label: cadence.label, days: Math.round(avgGap) };
    }
  }

  // Gaps exist but aren't consistent with any known cadence bucket —
  // still flag it, just with lower confidence, using the raw average.
  return { label: "irregular", days: Math.round(avgGap) };
}

/**
 * Main entry point: group emails by sender+amount, detect cadence,
 * and return only groups that look like genuine recurring charges
 * (2+ occurrences with a classifiable cadence).
 */
export function detectSubscriptions(emails) {
  const groups = new Map();

  for (const email of emails) {
    const sender = normalizeSender(email.from);
    const amount = extractAmount(email);
    if (amount === null) continue; // can't group without a number

    const key = `${sender}::${amount.toFixed(2)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(email);
  }

  const results = [];

  for (const [key, groupEmails] of groups.entries()) {
    if (groupEmails.length < 2) continue; // one-off, not recurring

    const sorted = [...groupEmails].sort(
      (a, b) => new Date(a.date) - new Date(b.date)
    );

    const gapsDays = [];
    for (let i = 1; i < sorted.length; i++) {
      const gap =
        (new Date(sorted[i].date) - new Date(sorted[i - 1].date)) /
        (1000 * 60 * 60 * 24);
      gapsDays.push(Math.round(gap));
    }

    const cadence = classifyCadence(gapsDays);
    if (!cadence) continue;

    const [sender, amountStr] = key.split("::");
    const lastDate = new Date(sorted[sorted.length - 1].date);
    const nextExpected = new Date(lastDate);
    nextExpected.setDate(nextExpected.getDate() + cadence.days);

    results.push({
      sender,
      amount: parseFloat(amountStr),
      occurrences: sorted.length,
      cadenceDays: cadence.days,
      cadenceLabel: cadence.label,
      firstChargeDate: sorted[0].date,
      lastChargeDate: sorted[sorted.length - 1].date,
      nextExpectedDate: nextExpected.toISOString().slice(0, 10),
      confidence: cadence.label === "irregular" ? "low" : "high",
      emails: sorted,
    });
  }

  // Highest-confidence, most-frequent subscriptions first.
  results.sort((a, b) => {
    if (a.confidence !== b.confidence) {
      return a.confidence === "high" ? -1 : 1;
    }
    return b.occurrences - a.occurrences;
  });

  return results;
}

// --- CLI entry point ---
if (import.meta.url === `file://${process.argv[1]}`) {
  const fs = await import("node:fs");
  const inputPath = process.argv[2];

  if (!inputPath) {
    console.error("Usage: node detect-subscriptions.mjs <emails.json>");
    process.exit(1);
  }

  const raw = fs.readFileSync(inputPath, "utf-8");
  const emails = JSON.parse(raw);
  const results = detectSubscriptions(emails);

  console.log(JSON.stringify(results, null, 2));
}
