// Local, read-only post-processing of agent-extracted observations; no MCP or network calls.
import { pathToFileURL } from 'node:url';

function text(value, label, max) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`Invalid ${label}`);
  return value;
}
function calendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Invalid date');
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error('Invalid date');
  return value;
}
function instant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) throw new Error('Invalid timestamp: explicit offset required');
  calendarDate(value.slice(0, 10));
  const hh = Number(value.slice(11, 13));
  const mm = Number(value.slice(14, 16));
  const ss = Number(value.slice(17, 19));
  const stamp = Date.parse(value);
  if (hh > 23 || mm > 59 || ss > 59 || !Number.isFinite(stamp)) throw new Error('Invalid timestamp');
  return stamp;
}
function localDate(stamp, timezone) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(stamp);
  const get = type => parts.find(x => x.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function buildDigest(input) {
  const timezone = text(input.timezone, 'timezone', 100);
  const now = instant(input.now);
  const today = localDate(now, timezone);
  if (!Array.isArray(input.messages) || input.messages.length > 20) throw new Error('At most 20 source messages');
  if (!Array.isArray(input.items) || input.items.length > 100) throw new Error('At most 100 observations');
  const sources = new Map();
  for (const message of input.messages) {
    const id = text(message.id, 'source id', 200);
    if (sources.has(id)) throw new Error('Invalid duplicate source id');
    sources.set(id, message);
  }
  const items = [], excluded = [], seen = new Set();
  for (const observation of input.items) {
    const source = sources.get(observation.email_id);
    if (!source) throw new Error('Unknown source message');
    if (source.scan_status !== 'clean' || source.content_omitted !== false) {
      if (!excluded.some(x => x.email_id === source.id)) excluded.push({ email_id: source.id, reason: 'unsafe_or_omitted_content' });
      continue;
    }
    const body = text(source.body, 'source body', 10000);
    const quote = text(observation.quote, 'evidence quote', 500);
    if (!body.includes(quote)) throw new Error('Unmatched evidence quote');
    const action = text(observation.action, 'action', 300);
    const thread = source.thread_id == null ? null : text(source.thread_id, 'thread id', 200);
    let deadline = null, local = null, bucket = 'needs_clarification';
    if (observation.deadline != null) {
      const fields = Object.keys(observation.deadline);
      if (fields.length !== 1) throw new Error('Use one deadline date or timestamp');
      if (fields[0] === 'date') {
        local = calendarDate(observation.deadline.date);
        deadline = { date: local };
        bucket = local < today ? 'overdue' : local === today ? 'due_today' : 'upcoming';
      } else if (fields[0] === 'at') {
        const stamp = instant(observation.deadline.at);
        local = localDate(stamp, timezone);
        deadline = { at: new Date(stamp).toISOString() };
        bucket = stamp <= now ? 'overdue' : local === today ? 'due_today' : 'upcoming';
      } else throw new Error('Use one deadline date or timestamp');
    }
    const row = { email_id: source.id, thread_id: thread, action, quote, deadline, local_date: local, bucket, thread_review_required: false };
    const key = JSON.stringify(row);
    if (!seen.has(key)) { seen.add(key); items.push(row); }
  }
  // Preserve conflicting observations; do not infer that the newest mail wins.
  for (const row of items) {
    const related = items.filter(x => x.email_id === row.email_id || (row.thread_id && x.thread_id === row.thread_id));
    if (new Set(related.map(x => JSON.stringify(x.deadline))).size > 1) {
      row.thread_review_required = true;
      row.bucket = 'needs_clarification';
    }
  }
  const order = { overdue: 0, due_today: 1, upcoming: 2, needs_clarification: 3 };
  items.sort((a, b) => order[a.bucket] - order[b.bucket] || (a.local_date ?? '').localeCompare(b.local_date ?? '') || a.email_id.localeCompare(b.email_id));
  return { as_of: new Date(now).toISOString(), timezone, effects: 'none', items, excluded };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    let raw = '';
    for await (const chunk of process.stdin) {
      raw += chunk;
      if (Buffer.byteLength(raw) > 1024 * 1024) throw new Error('Input exceeds 1 MiB');
    }
    process.stdout.write(`${JSON.stringify(buildDigest(JSON.parse(raw)), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`Deadline digest failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
