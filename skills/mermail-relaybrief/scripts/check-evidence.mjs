import { pathToFileURL } from 'node:url';

const addr = value => String(typeof value === 'object' ? value?.email || '' : value || '').trim().toLowerCase();
const date = value => Date.parse(value);
const isAddress = value => /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(addr(value));
const validScope = scope => scope && ['workspaceId', 'mailboxId', 'caseId', 'recipient', 'mailboxAddress'].every(key => typeof scope[key] === 'string' && scope[key].trim()) && isAddress(scope.recipient) && isAddress(scope.mailboxAddress) && Number.isFinite(date(scope.start)) && Number.isFinite(date(scope.end)) && date(scope.start) <= date(scope.end) && addr(scope.recipient) !== addr(scope.mailboxAddress);
const injection = /(?:^|\n)\s*(?:system|developer|assistant)\s*:|ignore\s+(?:all\s+)?(?:previous|prior|system|developer)\s+instructions|(?:reveal|exfiltrate)\s+(?:the\s+)?(?:secrets|credentials|system\s+prompt)/i;
const generation = value => typeof value === 'string' && value.trim() && value.length <= 128;
const stopped = code => ({ valid: false, errors: [{ codes: [code] }], acceptedClaimIds: [], withheld: true });
const runFailure = run => {
  if (!run || !generation(run.generation) || !generation(run.currentGeneration) || run.generation !== run.currentGeneration) return 'stale-or-unknown-run-generation';
  if (run.authentication !== 'verified' || run.scopeStatus !== 'matched') return 'authentication-or-scope-not-current';
  if (!Array.isArray(run.failures) || run.failures.length > 20) return 'unknown-run-failure-state';
  for (const failure of run.failures) {
    if (!failure || typeof failure !== 'object' || Array.isArray(failure) || !['authentication', 'scope', 'credits', 'timeout', 'rate-limit', 'transport'].includes(failure.category) || (failure.status !== undefined && (!Number.isInteger(failure.status) || failure.status < 400 || failure.status > 599))) return 'unknown-run-failure-state';
    if (['authentication', 'scope', 'credits'].includes(failure.category) || [401, 403, 402].includes(failure.status)) return 'terminal-authentication-scope-or-access-failure';
  }
  return null;
};

/** Local literal-provenance checks only. No MCP, network, mail writes or semantic-truth claim. */
export function checkEvidence(packet) {
  const errors = [], scopes = new Map(), sources = new Map(), duplicates = new Set(), accepted = new Map();
  const terminal = runFailure(packet?.run);
  if (terminal) return stopped(terminal);
  if (!packet || !validScope(packet.scope) || !Array.isArray(packet.comparisons) || !Array.isArray(packet.sources) || !Array.isArray(packet.claims) || !Array.isArray(packet.draftClaimIds)) return { valid: false, errors: [{ codes: ['invalid-packet-or-scope'] }], acceptedClaimIds: [] };
  if (packet.sources.length > 20 || packet.claims.length > 40 || packet.comparisons.length > 10 || packet.draftClaimIds.length > 40) return { valid: false, errors: [{ codes: ['evidence-budget-exceeded'] }], acceptedClaimIds: [] };
  if (packet.sources.some(source => !source || source.workspaceId !== packet.scope.workspaceId || source.mailboxId !== packet.scope.mailboxId)) return stopped('returned-workspace-or-mailbox-mismatch');
  if (packet.comparisons.some(comparison => !comparison?.scope || comparison.scope.workspaceId !== packet.scope.workspaceId || comparison.scope.mailboxId !== packet.scope.mailboxId)) return stopped('comparison-workspace-or-mailbox-mismatch');
  scopes.set('direct', packet.scope);
  for (const comparison of packet.comparisons) {
    if (!comparison || typeof comparison.id !== 'string' || !comparison.id || comparison.id === 'direct' || scopes.has(comparison.id) || !validScope(comparison.scope) || ['workspaceId', 'mailboxId'].some(field => comparison.scope[field] !== packet.scope[field]) || ['recipient', 'mailboxAddress'].some(field => addr(comparison.scope[field]) !== addr(packet.scope[field]))) errors.push({ codes: ['invalid-comparison-scope'] });
    else scopes.set(comparison.id, comparison.scope);
  }
  for (const source of packet.sources) {
    if (!source || typeof source.id !== 'string' || !source.id || source.id.length > 256) { errors.push({ codes: ['invalid-source-id'] }); continue; }
    if (sources.has(source.id)) duplicates.add(source.id);
    sources.set(source.id, source);
  }
  const seenClaims = new Set();
  for (const claim of packet.claims) {
    const codes = [];
    if (!claim || typeof claim.id !== 'string' || !claim.id || seenClaims.has(claim.id)) { if (claim?.id) accepted.delete(claim.id); errors.push({ codes: ['invalid-or-duplicate-claim-id'] }); continue; }
    seenClaims.add(claim.id);
    const scope = scopes.get(claim.scope);
    if (!scope) codes.push('unauthorized-claim-scope');
    if (!['fact', 'decision', 'contradiction', 'commitment', 'similar-case'].includes(claim.kind) || (claim.scope === 'direct' && claim.kind === 'similar-case')) codes.push('invalid-claim-kind');
    if (claim.scope !== 'direct' && claim.kind !== 'similar-case') codes.push('comparison-cannot-establish-current-case');
    if (!Array.isArray(claim.citations) || !claim.citations.length || claim.citations.length > 8) codes.push('missing-or-excessive-citations');
    for (const cite of Array.isArray(claim.citations) ? claim.citations : []) {
      const source = cite && sources.get(cite.emailId);
      if (!source) { codes.push('missing-source'); continue; }
      if (duplicates.has(source.id)) codes.push('ambiguous-source-id');
      if (!scope) continue;
      for (const field of ['workspaceId', 'mailboxId', 'caseId']) if (source[field] !== scope[field]) codes.push(field + '-mismatch');
      const own = addr(scope.mailboxAddress), peer = addr(scope.recipient), from = addr(source.from), to = (Array.isArray(source.to) ? source.to : []).map(addr);
      if (!Array.isArray(source.to) || to.length !== 1 || (source.cc !== undefined && !Array.isArray(source.cc)) || (source.bcc !== undefined && !Array.isArray(source.bcc)) || (source.cc || []).length || (source.bcc || []).length || !((from === own && to[0] === peer) || (from === peer && to[0] === own))) codes.push('exact-correspondent-pair-required');
      if (!Number.isFinite(date(source.date)) || date(source.date) < date(scope.start) || date(source.date) > date(scope.end)) codes.push('source-outside-window');
      if (source.scanStatus !== 'clean') codes.push('unclean-or-unknown-source');
      if (source.bodyTruncated !== false) codes.push('truncated-or-unknown-body');
      if (typeof source.body !== 'string' || !source.body.trim() || source.body.length > 10000) codes.push('unavailable-or-unbounded-body');
      if (injection.test(String(source.body || ''))) codes.push('instruction-bearing-source');
      if (typeof cite.quote !== 'string' || !cite.quote.trim() || typeof source.body !== 'string' || !source.body.includes(cite.quote)) codes.push('quotation-not-verbatim');
    }
    if (codes.length) errors.push({ claimId: claim.id, codes: [...new Set(codes)] });
    else accepted.set(claim.id, claim);
  }
  for (const id of packet.draftClaimIds) {
    const claim = accepted.get(id);
    if (!claim || claim.scope !== 'direct') errors.push({ claimId: id, codes: ['draft-outside-validated-direct-case'] });
  }
  return { valid: errors.length === 0, errors, acceptedClaimIds: [...accepted.keys()], partialRunFailures: packet.run.failures.length > 0, limit: 'Supplied run state and literal source binding only; not independent live authentication, semantic truth, consent, authority or complete coverage.' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let bytes = 0, text = '';
  process.stdin.setEncoding('utf8');
  try {
    for await (const chunk of process.stdin) {
      bytes += Buffer.byteLength(chunk);
      if (bytes > 512 * 1024) throw new Error('input-limit');
      text += chunk.toString();
    }
    const result = checkEvidence(JSON.parse(text));
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.valid ? 0 : 1;
  } catch {
    console.log(JSON.stringify({ valid: false, errors: [{ codes: ['invalid-json-or-input-limit'] }] }));
    process.exitCode = 1;
  }
}
