// mermail-bounty-radar — reference runner (used for the live demo).
// Polls public sources, scores against a profile, prints the ranked digest.
// No credentials. Usage: node radar.mjs [keywords-csv] [min-usd]
const KEYWORDS = (process.argv[2] || 'python,solana').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
const MIN_USD = Number(process.argv[3] || 100);

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url, timeoutMs = 15000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: c.signal, headers: { 'user-agent': 'mermail-bounty-radar-demo' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

function score(item, text) {
  const t = (text || '').toLowerCase();
  const hits = KEYWORDS.filter(k => t.includes(k));
  const match = hits.length / KEYWORDS.length;
  const reward = item.rewardUsd || 0;
  const rewardNorm = Math.min(reward / 1000, 1);
  let urgency = 0.3;
  if (item.deadline) {
    const hrs = (new Date(item.deadline) - Date.now()) / 36e5;
    if (hrs > 0) urgency = 1 - Math.min(hrs / 168, 1);
  }
  return { total: rewardNorm * 0.4 + match * 0.4 + urgency * 0.2, hits };
}

async function superteam() {
  const d = await get('https://superteam.fun/api/listings');
  const items = Array.isArray(d) ? d : (d.listings || d.data || []);
  const out = [];
  for (const l of items) {
    const dl = l.deadline ? new Date(l.deadline) : null;
    if (l.status && !/open|publish/i.test(l.status)) continue;
    if (dl && dl < new Date()) continue;
    const rewardUsd = Number(l.rewardAmount) || 0;
    if (rewardUsd < MIN_USD) continue;
    out.push({
      title: l.title, rewardUsd, token: l.token, deadline: l.deadline,
      url: 'https://superteam.fun/earn/listing/' + l.slug,
      agent: l.agentAccess, sponsor: (l.sponsor || {}).name || l.sponsor,
      text: (l.title || '') + ' ' + (l.type || ''),
    });
  }
  return out;
}

const seen = new Set();
async function main() {
  console.log(`📡 mermail-bounty-radar — profile: [${KEYWORDS.join(', ')}] · min $${MIN_USD}\n`);
  let items = [];
  try {
    const st = await superteam();
    console.log(`✓ superteam.fun — ${st.length} open items ≥ $${MIN_USD}`);
    items = items.concat(st);
  } catch (e) { console.log(`⚠ superteam source failed: ${e.message}`); }

  const scored = [];
  for (const it of items) {
    if (seen.has(it.url)) continue;
    const s = score(it, it.text);
    const matchScore = s.hits.length / KEYWORDS.length;
    if (matchScore < 0.25) continue; // per workflows.md: no skill match → filtered
    scored.push({ ...it, ...s });
  }
  scored.sort((a, b) => b.total - a.total);
  const top = scored.slice(0, 10);

  console.log(`\n${'='.repeat(64)}`);
  console.log(`🎯 Bounty radar digest — ${new Date().toISOString().slice(0, 10)} (${top.length} matches)`);
  console.log(`${'='.repeat(64)}\n`);
  top.forEach((it, i) => {
    const dl = it.deadline ? new Date(it.deadline) : 'no deadline';
    console.log(`${i + 1}. ${it.title}`);
    console.log(`   ${it.rewardUsd} ${it.token || ''} · closes ${dl}${it.agent ? ' · ' + it.agent : ''}`);
    console.log(`   matches: ${it.hits.join(', ') || '—'} · score ${it.total.toFixed(2)}`);
    console.log(`   ${it.url}\n`);
  });
  if (!top.length) console.log('(no new matches — silence is better than a "nothing new" email)\n');
}
main().catch(e => { console.error('radar failed:', e.message); process.exit(1); });
