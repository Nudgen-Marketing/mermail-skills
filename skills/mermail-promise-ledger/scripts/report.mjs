import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const STATES = new Set(['promised', 'proposed', 'accepted', 'superseded', 'disputed', 'reported_complete']);
function requireValue(ok, message) { if (!ok) throw new Error(message); }
function text(value, label, max = 2000) {
  requireValue(typeof value === 'string' && value.trim().length > 0 && value.length <= max, `${label}: expected nonempty text (max ${max})`);
  return value;
}
function nullable(value, label) { if (value !== null) text(value, label); }
function array(value, label, max) { requireValue(Array.isArray(value) && value.length <= max, `${label}: expected array (max ${max})`); }
function instant(value) { return typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value)); }

// Validates references and literal evidence; semantic interpretation remains the agent's job.
export function validateLedger(d) {
  requireValue(d && typeof d === 'object' && d.version === 1, 'version must be 1');
  text(d.title, 'title', 200); text(d.mailbox, 'mailbox', 300); text(d.thread, 'thread', 300);
  requireValue(instant(d.asOf), 'asOf requires an ISO timestamp with timezone');
  text(d.timezone, 'timezone', 100);
  try { new Intl.DateTimeFormat('en', { timeZone: d.timezone }); } catch { throw new Error('timezone must be an IANA timezone'); }
  requireValue(d.coverage && ['complete', 'partial'].includes(d.coverage.status), 'coverage.status must be complete or partial');
  text(d.coverage.detail, 'coverage.detail');
  requireValue(['fixture', 'live-mcp'].includes(d.provenance), 'provenance must be fixture or live-mcp');
  // A label describes where the agent says evidence came from, not a verified attestation.
  array(d.messages, 'messages', 50); requireValue(d.messages.length > 0, 'messages cannot be empty');
  const messages = new Map(); let chars = 0;
  for (const m of d.messages) {
    requireValue(!['draft', 'drafts', 'scheduled'].includes(String(m.folder ?? '').toLowerCase()), 'unsent messages cannot support agreement evidence');
    text(m.id, 'message.id', 200); requireValue(!messages.has(m.id), `duplicate message id: ${m.id}`);
    text(m.from, 'message.from', 300); text(m.subject, 'message.subject', 300);
    requireValue(instant(m.date), `invalid message date: ${m.id}`);
    requireValue(['pass', 'fail', 'unknown'].includes(m.authentication), `invalid authentication: ${m.id}`);
    text(m.text, 'message.text', 12000); chars += m.text.length; messages.set(m.id, m);
  }
  requireValue(chars <= 100000, 'message body budget exceeded');
  function evidence(items, label) {
    array(items, label, 8); requireValue(items.length > 0, `${label}: at least one source required`);
    for (const e of items) {
      const source = messages.get(e.messageId); requireValue(source, `${label}: unknown message ${e.messageId}`);
      text(e.quote, `${label}.quote`, 500);
      requireValue(source.text.includes(e.quote), `${label}: quote not found in ${e.messageId}`);
    }
  }
  array(d.commitments, 'commitments', 100); const claims = new Map();
  for (const c of d.commitments) {
    text(c.id, 'commitment.id', 100); requireValue(!claims.has(c.id), `duplicate commitment id: ${c.id}`);
    text(c.deliverable, 'deliverable'); nullable(c.owner, 'owner'); nullable(c.deadlineText, 'deadlineText');
    requireValue(STATES.has(c.state), `invalid state: ${c.id}`);
    nullable(c.supersedes, 'supersedes'); nullable(c.dueAt, 'dueAt');
    requireValue(c.dueAt === null || instant(c.dueAt), `dueAt requires an ISO timestamp with timezone: ${c.id}`);
    requireValue(c.dueAt === null || c.deadlineText !== null, `normalized deadline needs source wording: ${c.id}`);
    text(c.reasoning, 'reasoning'); evidence(c.evidence, `commitment ${c.id}`);
    array(c.acceptanceEvidence, 'acceptanceEvidence', 8);
    if (c.state === 'accepted') evidence(c.acceptanceEvidence, `acceptance ${c.id}`);
    else if (c.acceptanceEvidence.length) evidence(c.acceptanceEvidence, `acceptance ${c.id}`);
    claims.set(c.id, c);
  }
  for (const c of d.commitments) {
    if (c.supersedes !== null) {
      const previous = claims.get(c.supersedes);
      requireValue(previous && previous.id !== c.id, `invalid supersedes reference: ${c.id}`);
      requireValue(['accepted', 'superseded'].includes(c.state) && c.acceptanceEvidence.length > 0, `only an accepted revision may supersede: ${c.id}`);
      requireValue(previous.state === 'superseded', `previous commitment must be superseded: ${c.id}`);
      const seen = new Set([c.id]); let current = previous;
      while (current) {
        requireValue(!seen.has(current.id), 'revision cycle'); seen.add(current.id);
        current = current.supersedes === null ? null : claims.get(current.supersedes);
      }
    }
    if (c.state === 'superseded') requireValue(d.commitments.some(n => n.supersedes === c.id && ['accepted', 'superseded'].includes(n.state) && n.acceptanceEvidence.length > 0), `superseded claim lacks accepted successor: ${c.id}`);
  }
  array(d.issues, 'issues', 100);
  for (const i of d.issues) {
    requireValue(['conflict', 'missing_owner', 'missing_deadline', 'question', 'limitation'].includes(i.kind), 'invalid issue kind');
    text(i.summary, 'issue.summary'); evidence(i.evidence, 'issue');
  }
  text(d.clarificationDraft, 'clarificationDraft', 10000);
  return d;
}

export function deadlineStatus(c, d) {
  if (c.state === 'superseded') return 'Replaced';
  if (c.state === 'reported_complete') return 'Reported complete; unverified';
  if (c.state === 'proposed' || c.state === 'disputed') return 'Unresolved';
  if (!c.dueAt) return 'Date/time needs clarification';
  if (c.state !== 'accepted') return 'Deadline stated; acceptance unconfirmed';
  return Date.parse(c.dueAt) < Date.parse(d.asOf) ? 'Overdue as of review' : 'Upcoming as of review';
}
const html = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
const md = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\\/g, '\\\\').replace(/([`*_\[\]#|])/g, '\\$1').replace(/\r?\n/g, ' / ');
export function renderLedger(input) {
  const d = validateLedger(input);
  const sourceNumber = new Map(d.messages.map((m, i) => [m.id, i + 1]));
  const citeHtml = list => list.map(e => `<a href="#source-${sourceNumber.get(e.messageId)}">Source ${sourceNumber.get(e.messageId)}</a><blockquote>${html(e.quote)}</blockquote>`).join('');
  const citeMd = list => list.map(e => `Source ${sourceNumber.get(e.messageId)} (${md(e.messageId)}): “${md(e.quote)}”`).join('; ');
  const rows = d.commitments.map(c => `<tr><td><strong>${html(c.deliverable)}</strong><small>${html(c.id)}${c.supersedes ? ` · replaces ${html(c.supersedes)}` : ''}</small></td><td>${html(c.owner ?? 'Unknown')}</td><td>${html(c.deadlineText ?? 'Unknown')}<small>${html(c.dueAt ?? 'Not normalized')}</small></td><td><span class="tag">${html(c.state.replaceAll('_', ' '))}</span><small>${html(deadlineStatus(c,d))}</small></td><td>${citeHtml(c.evidence)}${c.acceptanceEvidence.length ? `<strong>Acceptance evidence</strong>${citeHtml(c.acceptanceEvidence)}` : ''}<small>${html(c.reasoning)}</small></td></tr>`).join('');
  const issueHtml = d.issues.map(i => `<article><span class="tag">${html(i.kind.replaceAll('_', ' '))}</span><p>${html(i.summary)}</p>${citeHtml(i.evidence)}</article>`).join('');
  const sourceHtml = d.messages.map((m,i) => `<details id="source-${i+1}"><summary>Source ${i+1} · ${html(m.from)} · ${html(m.date)}</summary><p>ID: ${html(m.id)} · Sender authentication: ${html(m.authentication)}</p><p>${html(m.subject)}</p><pre>${html(m.text)}</pre></details>`).join('');
  const htmlDocument = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${html(d.title)} · Promise Ledger</title><style>
  :root{font-family:Segoe UI,system-ui,sans-serif;color:#192d36;background:#f4f7f6}*{box-sizing:border-box}body{margin:0}header{background:#123f40;color:white;padding:48px max(24px,calc((100vw - 1200px)/2))}header p{color:#cee8dd}h1{font-size:clamp(28px,4vw,44px);margin:12px 0}h2{font-size:24px}main{max-width:1200px;margin:auto;padding:24px}.eyebrow{letter-spacing:2px;font-size:12px;text-transform:uppercase}.notice{border-left:5px solid #bc7a28;padding:16px;background:#fff8e8}.stats{display:flex;gap:16px;flex-wrap:wrap;margin:24px 0}.stats div{background:white;padding:20px;flex:1;min-width:150px;border-radius:12px}.stats strong{display:block;font-size:32px}.scroll{overflow:auto}table{width:100%;border-collapse:collapse;background:white}th{text-align:left;background:#e4eeea}th,td{padding:16px;vertical-align:top;border-bottom:1px solid #dce6e2}td:first-child{min-width:180px}td:last-child{min-width:260px}small{display:block;margin-top:8px;color:#54636b}.tag{display:inline-block;background:#e4eeea;border-radius:20px;padding:5px 10px;font-size:12px}blockquote{border-left:3px solid #6a9481;margin:8px 0;padding-left:12px;font-size:14px}a{color:#176156}article,details{background:white;padding:20px;border:1px solid #dce6e2;border-radius:10px;margin:12px 0}summary{cursor:pointer;font-weight:600}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;background:white;padding:20px;border-radius:10px}footer{padding:24px 0;color:#54636b;font-size:13px}@media print{header{padding:20px}main{padding:0}.scroll{overflow:visible}td,th{padding:8px}details{break-inside:avoid}}
  </style></head><body><header><div class="eyebrow">Promise Ledger / Mermail agent skill</div><h1>${html(d.title)}</h1><p>Know what was promised. See what changed. Ask what is missing.</p><div>${html(d.mailbox)} · ${html(d.thread)}</div></header><main><div class="notice"><strong>${d.provenance === 'fixture' ? 'SYNTHETIC LOCAL DEMO — no live Mermail connection' : 'Agent-declared live MCP evidence — provenance not independently verified'}</strong><p>Coverage: ${html(d.coverage.status)}. ${html(d.coverage.detail)}</p>As of ${html(d.asOf)} · ${html(d.timezone)}</div><div class="stats"><div><strong>${d.commitments.length}</strong>Commitment versions</div><div><strong>${d.issues.length}</strong>Questions &amp; gaps</div><div><strong>${d.messages.length}</strong>Source messages</div></div><h2>Commitments &amp; revisions</h2><div class="scroll"><table><thead><tr><th>Deliverable</th><th>Owner</th><th>Deadline</th><th>State</th><th>Evidence &amp; interpretation</th></tr></thead><tbody>${rows || '<tr><td colspan="5">No supported commitments found in reviewed messages.</td></tr>'}</tbody></table></div><h2>Clarify before handoff</h2>${issueHtml || '<p>No additional issues identified in reviewed messages.</p>'}<h2>Clarification draft <span class="tag">Unsent</span></h2><pre>${html(d.clarificationDraft)}</pre><h2>Source trail</h2><p>Statements are attributed to email participants. Authentication and delivery are separate from agreement.</p>${sourceHtml}<footer>Generated locally. No email was sent. Literal evidence was validated; interpretation requires human review. Do not publish private correspondence.</footer></main></body></html>`;
  const markdown = `# ${md(d.title)}\n\nPromise Ledger • ${d.provenance === 'fixture' ? 'SYNTHETIC LOCAL DEMO — no live Mermail connection' : 'Agent-declared live MCP; not independently verified'}\n\nMailbox: ${md(d.mailbox)}\n\nThread: ${md(d.thread)}\n\nAs of: ${md(d.asOf)} (${md(d.timezone)})\n\nCoverage: **${d.coverage.status}**. ${md(d.coverage.detail)}\n\n## Commitments and revisions\n\n| ID | Deliverable | Owner | Deadline | State | Review | Evidence |\n| --- | --- | --- | --- | --- | --- | --- |\n${d.commitments.map(c => `| ${md(c.id)}${c.supersedes ? ` (replaces ${md(c.supersedes)})` : ''} | ${md(c.deliverable)} | ${md(c.owner ?? 'Unknown')} | ${md(c.deadlineText ?? 'Unknown')} | ${c.state} | ${md(deadlineStatus(c,d))} | ${citeMd(c.evidence)}${c.acceptanceEvidence.length ? `; Acceptance: ${citeMd(c.acceptanceEvidence)}` : ''}; Interpretation: ${md(c.reasoning)} |`).join('\n')}\n\n## Clarify before handoff\n\n${d.issues.map(i => `- **${i.kind}**: ${md(i.summary)} — ${citeMd(i.evidence)}`).join('\n') || 'No additional issues identified in reviewed messages.'}\n\n## Unsent clarification draft\n\n${md(d.clarificationDraft)}\n\n## Sources\n\n${d.messages.map((m,i) => `### Source ${i+1}\n\nID: ${md(m.id)} · ${md(m.from)} · ${md(m.date)} · authentication: ${m.authentication}\n\n${md(m.subject)}\n\n${md(m.text)}`).join('\n\n')}\n\nLiteral evidence validated. Interpretation requires human review. No email sent.\n`;
  return { html: htmlDocument, markdown };
}

export async function writeReport(inputPath, outputDir) {
  const d = JSON.parse(await readFile(inputPath, 'utf8'));
  const result = renderLedger(d); // Validate before creating any artifacts.
  await mkdir(outputDir, { recursive: true });
  await writeFile(resolve(outputDir, 'ledger.html'), result.html, 'utf8');
  await writeFile(resolve(outputDir, 'ledger.md'), result.markdown, 'utf8');
  return { messages: d.messages.length, commitments: d.commitments.length, coverage: d.coverage.status };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [, , inputPath, outputDir] = process.argv;
  if (!inputPath || !outputDir) { console.error('Usage: node report.mjs <ledger.json> <output-directory>'); process.exitCode = 1; }
  else {
    try { console.log(JSON.stringify(await writeReport(inputPath, outputDir))); }
    catch (err) { console.error(`Report rejected: ${err.message}`); process.exitCode = 1; }
  }
}
