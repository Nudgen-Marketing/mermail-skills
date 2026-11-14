#!/usr/bin/env node
// Offline classification only. The host browser captures non-secret counters
// after applying its own destination/redirect/network guards. Never navigates.
import { readFile, stat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { validateResource } from './reconcile-x402.mjs';

const counts = ['emailFields','passwordFields','cardFields','captcha','consentCheckboxes'];
export function inspectSnapshot(snapshot, frozenResource) {
  const invalid = { verdict:'malformed', classification:'unverified_host_snapshot', authorization:'none' };
  try {
    const frozen=validateResource(frozenResource);
    if (frozen.search) throw Error('No query strings in probe snapshots');
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return invalid;
    const landed=validateResource(snapshot.landed);
    if (landed.search) return invalid;
    if (frozen.origin !== landed.origin) return {verdict:'origin_drift',authorization:'none'};
    if (!Number.isInteger(snapshot.status) || snapshot.status<100 || snapshot.status>599) return invalid;
    if (snapshot.status>=400) return {verdict:'http_error',status:snapshot.status,authorization:'none'};
    if (snapshot.status<200 || snapshot.status>=300) return {verdict:'http_error',authorization:'none'};
    if (typeof snapshot.bodyNull !== 'boolean' || !Number.isInteger(snapshot.childCount) || snapshot.childCount<0 || snapshot.childCount>1000000) return invalid;
    const form=snapshot.form;
    if (!form || counts.some(k=>!Number.isInteger(form[k]) || form[k]<0 || form[k]>1000000) ||
        typeof form.mentionsTerms!=='boolean' || typeof form.oauthOnly!=='boolean') return invalid;
    const humanSteps=[];
    if(form.passwordFields) humanSteps.push('password');
    if(form.cardFields) humanSteps.push('card');
    if(form.captcha) humanSteps.push('captcha');
    if(form.consentCheckboxes || form.mentionsTerms) humanSteps.push('consent');
    if(form.oauthOnly) humanSteps.push('third-party-login');
    const verdict=form.captcha ? 'human_required' :
      snapshot.bodyNull || snapshot.childCount===0 ? 'blocked_hydration_wipe' :
      humanSteps.length ? 'human_required' : 'renderable';
    return {verdict,humanSteps,origin:frozen.origin,classification:'unverified_host_snapshot',authorization:'none'};
  } catch { return invalid; }
}

export async function main(args) {
  if(args.length!==3 || args[0]!=='--snapshot') throw Error('Use --snapshot <non-secret-json-file> <frozen-https-url>; this helper does not navigate');
  const info=await stat(args[1]);
  if(!info.isFile() || info.size>65536) throw Error('Expected snapshot file at most 64 KiB');
  const data=await readFile(args[1],'utf8');
  if(Buffer.byteLength(data)>65536) throw Error('Snapshot too large');
  return inspectSnapshot(JSON.parse(data),args[2]);
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {const r=await main(process.argv.slice(2));console.log(JSON.stringify(r,null,2));process.exitCode=r.verdict==='renderable'?0:2;}
  catch {console.error(JSON.stringify({verdict:'malformed',detail:'Invalid offline probe input; no navigation performed'}));process.exitCode=2;}
}
