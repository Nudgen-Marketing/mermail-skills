// Child-process-only fixture. Every network request is intercepted; never falls through.
import fs from 'node:fs';
const scenario = process.env.E2E_FIXTURE_CASE;
const record = { id: 'new-email', folder_id: 'inbox', recipient: 'qa@example.test', sender: 'app@example.test',
  subject: 'Verify account', date: new Date().toISOString(), scan_status: 'clean', body_format: 'html',
  body: '<p>Code 782341</p><a href="https://app.example.test/verify/xy?token=ab#secret">Verify</a>',
  sender_authentication: { status: 'pass' } };
const calls = [];
if (scenario?.startsWith('sent')) {
  record.folder_id = 'sent'; record.scan_status = null;
  record.delivery_status = scenario === 'sent-accepted' ? 'accepted' : 'delivered';
  record.provider_metadata = { terminal: true, delivery: { status: scenario === 'sent-conflict' ? 'failed' : record.delivery_status } };
}
process.on('exit', () => fs.writeFileSync(process.env.E2E_FIXTURE_CALLS, JSON.stringify(calls)));
const response = (data) => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
globalThis.fetch = async (input, init = {}) => {
  const url = String(input);
  calls.push({ url, method: init.method ?? 'GET' });
  if (url === 'https://fixture.invalid/mcp') {
    if (scenario === '429') return new Response('', { status: 429, headers: { 'retry-after': '0' } });
    if (scenario === '429-deadline') return new Response('', { status: 429, headers: { 'retry-after': '999999' } });
    const request = JSON.parse(init.body);
    if (request.method === 'initialize') return response({ result: {} });
    const { name, arguments: args } = request.params;
    calls.at(-1).tool = name;
    calls.at(-1).args = args;
    let data;
    if (name === 'list_mailboxes') data = [{ public_id: 'box', email: 'qa@example.test', can_receive: true }];
    else if (name === 'list_emails') data = { emails: [], totalCount: scenario === 'baseline-partial' ? 1 : 0 };
    else if (name === 'search_emails') {
      let selected = { ...record };
      if (scenario === 'missing-folder') delete selected.folder_id;
      if (scenario === 'missing-recipient') delete selected.recipient;
      data = { emails: scenario === 'duplicate' ? [selected, { ...selected, id: 'second-email' }] : [selected], totalCount: scenario === 'duplicate' ? 2 : 1 };
      if (scenario === 'page-two-duplicate' || scenario === 'page-two-foreign') data = {
        emails: [args.query.page === 1 ? selected : { ...selected, id: 'second-email', recipient: scenario === 'page-two-foreign' ? 'other@example.test' : selected.recipient }], totalCount: 2,
      };
    } else if (name === 'get_email') {
      data = { ...record };
      if (scenario === 'flagged' || scenario === 'unknown') data.scan_status = scenario === 'flagged' ? 'flagged' : null;
      if (scenario === 'omitted') data.content_omitted = true;
      if (scenario === 'truncated') data.content_truncated = true;
      if (scenario === 'deleted') data.body_storage_status = 'deleted';
      if (scenario === 'foreign') data.id = 'foreign-email';
      if (scenario === 'mismatch') data.body = data.body.replace('Code', 'undefined Code');
      if (scenario === 'two-codes') data.body += '<p>Other code 918273</p>';
    } else throw new Error('Unexpected MCP tool in offline fixture');
    return response({ result: { structuredContent: data } });
  }
  if (url === 'https://app.example.test/trigger') return response({ ok: true });
  if (url.startsWith('https://app.example.test/verify/')) {
    if (scenario === 'follow-failed') return new Response('private-code782341', { status: 400 });
    return response({ verified: true });
  }
  if (url === 'https://app.example.test/confirm') return response({ ok: true });
  throw new Error('Offline fixture rejected unexpected network request');
};
