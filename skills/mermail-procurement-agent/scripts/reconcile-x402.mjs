#!/usr/bin/env node
// Advisory comparison only; never payment approval or settlement verification.
// Offline: --required <base64> --max <decimal> --asset <id> --network <id>
//          --pay-to <id> --decimals <0..36> --resource <exact HTTPS URL>
// Network: add --probe; one explicit unpaid GET only, no redirects or credentials.
// --response decodes a saved PAYMENT-RESPONSE as an unverified claim.
import { pathToFileURL } from 'node:url';
import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { isIP } from 'node:net';

const LIMIT = 65536;
const invalid = detail => ({ verdict: 'malformed', detail });
const decimal = value => typeof value === 'string' && value.length <= 100 && /^(0|[1-9]\d*)(\.\d+)?$/.test(value);
const uint = value => typeof value === 'string' && value.length <= 100 && /^(0|[1-9]\d*)$/.test(value);

function units(value, decimals) {
  if (!decimal(value)) throw Error('Invalid decimal');
  const [whole, fraction = ''] = value.split('.');
  if (fraction.length > decimals) throw Error('Amount exceeds declared precision');
  return BigInt(whole + fraction.padEnd(decimals, '0'));
}

export function validateResource(value) {
  if (typeof value !== 'string' || value.length > 2048) throw Error('Missing resource');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash ||
      (url.port && url.port !== '443') || isIP(url.hostname.replace(/^\[|\]$/g, '')) ||
      !url.hostname.includes('.') || /(^|\.)(localhost|local|internal|test|invalid)$/.test(url.hostname)) {
    throw Error('Resource must be public HTTPS without credentials, fragment or alternate port');
  }
  return url;
}

function identity(value, network) {
  if (typeof value !== 'string' || !value || value.length > 200 || /\s/.test(value)) throw Error('Missing identity');
  if (network.startsWith('eip155:')) {
    if (!/^0x[0-9a-fA-F]{40}$/.test(value)) throw Error('Invalid EVM identity');
    return value.toLowerCase();
  }
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) throw Error('Invalid Solana identity');
  return value; // Base58 is case-sensitive.
}

export function validateEnvelope(env) {
  if (!env || !/^(eip155:[1-9]\d*|solana:[A-Za-z0-9]+)$/.test(env.network || '')) throw Error('Missing or invalid network');
  if (!Number.isInteger(env.decimals) || env.decimals < 0 || env.decimals > 36) throw Error('Explicit decimals required');
  if (units(env.max, env.decimals) <= 0n) throw Error('Positive maximum required');
  identity(env.asset, env.network);
  identity(env.payTo, env.network);
  validateResource(env.resource);
  return env;
}

function decode(b64) {
  if (typeof b64 !== 'string' || b64.length > LIMIT * 2 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) throw Error('Invalid bounded base64');
  const bytes = Buffer.from(b64, 'base64');
  if (bytes.length > LIMIT || bytes.toString('base64').replace(/=+$/, '') !== b64.replace(/=+$/, '')) throw Error('Invalid base64 encoding');
  return JSON.parse(bytes.toString('utf8'));
}

export function reconcileChallenge(b64, env) {
  try {
    validateEnvelope(env);
    const c = decode(b64);
    if (c.x402Version !== 2 || !Array.isArray(c.accepts) || !c.accepts.length || c.accepts.length > 32) return invalid('Expected bounded v2 accepts');
    if (validateResource(c.resource?.url).href !== validateResource(env.resource).href) return { verdict: 'resource_mismatch' };
    const networkMatches = c.accepts.filter(a => a?.network === env.network);
    if (!networkMatches.length) return { verdict: 'network_mismatch' };
    const matches = networkMatches.filter(a => identity(a.asset, env.network) === identity(env.asset, env.network));
    if (!matches.length) return { verdict: 'asset_mismatch' };
    const payees = matches.filter(a => identity(a.payTo, env.network) === identity(env.payTo, env.network));
    if (!payees.length) return { verdict: 'payee_mismatch' };
    if (payees.length !== 1) return invalid('Ambiguous matching offers');
    const a = payees[0];
    if (!['exact', 'upto'].includes(a.scheme) || !uint(a.amount) || BigInt(a.amount) <= 0n ||
        !Number.isSafeInteger(a.maxTimeoutSeconds) || a.maxTimeoutSeconds <= 0 || a.maxTimeoutSeconds > 86400) return invalid('Invalid offer fields');
    const amount = BigInt(a.amount), maximum = units(env.max, env.decimals);
    return {
      verdict: amount <= maximum ? 'within_envelope' : 'above_cap',
      selected_accepts_index: c.accepts.indexOf(a),
      amount_base: a.amount, maximum_base: maximum.toString(),
      amount_semantics: a.scheme === 'upto' ? 'maximum; settlement requires independent evidence' : 'exact',
      authorization: 'comparison_only_not_payment_approval',
    };
  } catch (error) { return invalid(error.message); }
}

export function decodeSettlement(b64) {
  try {
    const s = decode(b64);
    if (typeof s.success !== 'boolean') return invalid('Expected success boolean');
    return { verdict: s.success ? 'settlement_reported' : 'settlement_failed',
      verified: false, amount: 'not carried by PAYMENT-RESPONSE',
      detail: 'Untrusted receipt claim; verify exact request and chain evidence separately' };
  } catch (error) { return invalid(error.message); }
}

export function publicIPv4(address) {
  if (isIP(address) !== 4) return false;
  const [a,b,c] = address.split('.').map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113));
}

// Resolve once and pin the socket lookup: no second DNS resolution or redirects.
export async function probeChallenge(resource, dependencies = {}) {
  const url = validateResource(resource);
  let dnsTimer;
  let addresses;
  try {
    addresses = await Promise.race([
      (dependencies.lookup || lookup)(url.hostname, { all: true, family: 4 }),
      new Promise((_, reject) => { dnsTimer = setTimeout(() => reject(Error('DNS deadline exceeded')), 5000); }),
    ]);
  } finally { clearTimeout(dnsTimer); }
  if (!addresses.length || addresses.some(x => !publicIPv4(x.address))) throw Error('Non-public or unsupported destination');
  const selected = addresses[0];
  return await new Promise((resolve, reject) => {
    const req = (dependencies.request || request)(url, { method: 'GET', headers: { accept: 'application/json' },
      lookup: (_host, options, cb) => options?.all ? cb(null, [selected]) : cb(null, selected.address, 4),
    }, res => {
      if (res.statusCode !== 402) { res.resume(); reject(Error('Expected 402; redirects and other statuses are not followed')); return; }
      const chunks = []; let count = 0;
      res.on('data', chunk => { count += chunk.length; if (count > LIMIT) { res.destroy(Error('Response too large')); return; } chunks.push(chunk); });
      res.on('error', reject);
      res.on('close', () => clearTimeout(timer));
      res.on('end', () => {
        const header = res.headers['payment-required'];
        if (Array.isArray(header)) { reject(Error('Ambiguous challenge header')); return; }
        resolve(header || Buffer.concat(chunks).toString('base64'));
      });
    });
    const timer = setTimeout(() => req.destroy(Error('Probe deadline exceeded')), 10000);
    req.on('close', () => clearTimeout(timer)); req.on('error', reject); req.end();
  });
}

export async function main(args) {
  const allowed = new Set(['--required','--response','--max','--asset','--network','--pay-to','--decimals','--resource','--probe','--self-check']);
  const opts = {};
  for (let i=0; i<args.length; i++) {
    const key=args[i];
    if (!allowed.has(key) || key in opts) throw Error('Unknown or duplicate argument');
    opts[key] = ['--probe','--self-check'].includes(key) ? true : args[++i];
    if (opts[key] === undefined) throw Error('Missing argument value');
  }
  if (opts['--self-check']) {
    const asset='0x'+'1'.repeat(40), payTo='0x'+'2'.repeat(40);
    const env={max:'1',asset,payTo,network:'eip155:8453',decimals:6,resource:'https://vendor.example/resource'};
    const c=Buffer.from(JSON.stringify({x402Version:2,resource:{url:env.resource},accepts:[{network:env.network,asset,payTo,amount:'1000000',scheme:'exact',maxTimeoutSeconds:60}]})).toString('base64');
    if (reconcileChallenge(c,env).verdict !== 'within_envelope' || reconcileChallenge(c,{}).verdict !== 'malformed') throw Error('Self-check failed');
    return {verdict:'self_check_pass'};
  }
  if (opts['--response']) {
    if (Object.keys(opts).length !== 1) throw Error('Response decode is a separate offline operation');
    return decodeSettlement(opts['--response']);
  }
  const env=validateEnvelope({max:opts['--max'],asset:opts['--asset'],network:opts['--network'],payTo:opts['--pay-to'],decimals:opts['--decimals'] === undefined ? NaN : Number(opts['--decimals']),resource:opts['--resource']});
  if (!!opts['--required'] === !!opts['--probe']) throw Error('Choose saved --required or explicit --probe');
  const required=opts['--required'] || await probeChallenge(env.resource);
  return reconcileChallenge(required,env);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { const result=await main(process.argv.slice(2)); console.log(JSON.stringify(result,null,2)); process.exitCode=['within_envelope','self_check_pass'].includes(result.verdict)?0:2; }
  catch (error) { console.error(JSON.stringify(invalid(error.message))); process.exitCode=2; }
}
