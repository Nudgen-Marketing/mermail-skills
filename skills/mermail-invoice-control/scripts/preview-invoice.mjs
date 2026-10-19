#!/usr/bin/env node
// Offline-only labeled-field projection. Never contacts MCP, loads credentials,
// writes a ledger, saves/sends mail, reserves funds or authorizes payment.
import {readFile,stat} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

const fields=['workspaceId','mailboxId','emailId','threadId'];
const id=s=>typeof s==='string' && s.length>0 && s.length<=256 && !/[\u0000-\u001f\u007f]/.test(s);
const decimal=s=>typeof s==='string' && s.length<=100 && /^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(s);
const currency=s=>typeof s==='string' && /^[A-Z][A-Z0-9]{2,11}$/.test(s);
function day(s) {
  if(typeof s!=='string' || !/^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}$/.test(s))return false;
  const d=new Date(s+'T00:00:00Z');return Number.isFinite(d.valueOf()) && d.toISOString().slice(0,10)===s;
}
function units(s,n) {
  if(!decimal(s) || !Number.isSafeInteger(n) || n<0 || n>36)throw Error('invalid_amount');
  const [w,f='']=s.split('.');if(f.length>n)throw Error('excess_precision');
  return BigInt(w+f.padEnd(n,'0'));
}

export function previewInvoice(record,selected,policy) {
  const base={mode:'offline_review_only',authorizesPayment:false,authorizesSend:false,
    execution:'not_attempted',ledgerChecked:false,policyChecked:false};
  if(!selected || !record || !fields.every(k=>id(selected[k]) && selected[k]===record[k]))
    return {...base,status:'held_scope',reasons:['source_binding_missing_or_mismatched']};
  const source=Object.fromEntries(fields.map(k=>[k,selected[k]]));
  if(record.scan_status!=='clean' || record.sender_authentication?.status!=='pass' ||
      record.agent_safe_content!==true || record.native_hold!==false || record.content_omitted!==false ||
      record.truncated!==false || record.authored_separated!==true)
    return {...base,source,status:'held_intake',reasons:['trusted_native_intake_required']};
  if(typeof record.safe_text!=='string' || record.safe_text.length>10000 ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(record.safe_text) ||
      /<\/?[A-Za-z][^>]*>/.test(record.safe_text))
    return {...base,source,status:'held_intake',reasons:['bounded_normalized_plain_text_required']};
  const values=new Map(),reasons=[];
  const add=(name,value)=>{const v=value.trim();if(!values.has(name))values.set(name,new Set());values.get(name).add(v);};
  for(const line of record.safe_text.split(/\r?\n/)) {
    const m=line.match(/^\s*(Vendor|Biller|Company|Merchant|Invoice\s*#|Invoice(?:\s+(?:Number|No\.?))?|Amount(?:\s+Due)?|Total\s+Amount|Currency|Due(?:\s+Date)?|Issue(?:\s+Date)?|Pay\s*To)\s*[:#]\s*(.*?)\s*$/i);
    if(!m)continue;
    const label=m[1].toLowerCase().replace(/\s+/g,' '),value=m[2];
    if(/^(vendor|biller|company|merchant)$/.test(label))add('vendor',value);
    else if(label.startsWith('invoice'))add('invoice_number',value);
    else if(label==='currency')add('currency',value);
    else if(label.startsWith('due'))add('due_date',value);
    else if(label.startsWith('issue'))add('issue_date',value);
    else if(label.startsWith('pay'))add('pay_to_claim',value);
    else {
      const amount=value.match(/^([^\s]+)(?:\s+([A-Za-z][A-Za-z0-9]{2,11}))?$/);
      if(!amount){reasons.push('invalid_amount_label');continue;}
      add('amount',amount[1]);if(amount[2])add('currency',amount[2]);
    }
  }
  const claims={};
  for(const [name,set] of values) {
    if(set.size!==1){reasons.push('conflicting_'+name);continue;}
    const value=[...set][0];
    if(!value || value.length>200 || /[<>\u007f]/.test(value) || /https?:\/\//i.test(value))reasons.push('invalid_'+name);
    else claims[name]=value;
  }
  for(const key of ['vendor','invoice_number','amount','currency','due_date'])if(!claims[key])reasons.push('missing_'+key);
  if(claims.amount && (!decimal(claims.amount) || !/[1-9]/.test(claims.amount)))reasons.push('invalid_amount');
  if(claims.currency && !currency(claims.currency))reasons.push('ambiguous_or_invalid_currency');
  for(const key of ['due_date','issue_date'])if(claims[key] && !day(claims[key]))reasons.push('invalid_'+key);
  if(day(claims.issue_date) && day(claims.due_date) && claims.due_date<claims.issue_date)reasons.push('due_before_issue');
  if(reasons.length)return {...base,source,claims,status:'needs_clarification',reasons:[...new Set(reasons)]};
  if(policy===undefined)return {...base,source,claims,status:'needs_owner_policy',reasons:['independent_policy_not_supplied']};
  if(!policy || policy.owner_confirmed!==true || !id(policy.version) ||
      policy.workspaceId!==selected.workspaceId || policy.mailboxId!==selected.mailboxId ||
      !currency(policy.currency) || !decimal(policy.max_amount) ||
      !Array.isArray(policy.allowed_vendors) || policy.allowed_vendors.length<1 || policy.allowed_vendors.length>100 ||
      !policy.allowed_vendors.every(id))
    return {...base,source,claims,status:'held_policy',reasons:['incomplete_independent_policy']};
  if(claims.currency!==policy.currency)
    return {...base,source,claims,status:'held_policy',reasons:['currency_mismatch_no_conversion']};
  try {
    const amount=units(claims.amount,policy.decimals),cap=units(policy.max_amount,policy.decimals);
    if(cap<=0n)throw Error('nonpositive_policy_cap');
    const violations=[];
    if(!policy.allowed_vendors.includes(claims.vendor))violations.push('vendor_not_exactly_listed');
    if(amount>cap)violations.push('above_declared_cap');
    return {...base,source,claims,policyChecked:true,policyVersion:policy.version,
      status:violations.length?'held_policy':'within_declared_policy_for_review',reasons:violations,
      amountBaseUnits:amount.toString(),capBaseUnits:cap.toString(),
      next:'owner_registry_ledger_and_exact_effect_review_required'};
  } catch {return {...base,source,claims,status:'held_policy',reasons:['invalid_policy_amount_or_precision']};}
}

async function jsonFile(path,max) {
  const info=await stat(path);if(!info.isFile() || info.size>max)throw Error('invalid_file');
  const bytes=await readFile(path);if(bytes.length>max)throw Error('invalid_file');return JSON.parse(bytes.toString('utf8'));
}
export async function main(args) {
  const allowed=new Set(['--input-file','--policy-file','--workspace-id','--mailbox-id','--email-id','--thread-id']);
  const opts={};for(let i=0;i<args.length;i++){const k=args[i];if(!allowed.has(k)||k in opts||!args[i+1])throw Error('invalid_argument');opts[k]=args[++i];}
  if(!opts['--input-file'] || !['workspace','mailbox','email','thread'].every(k=>id(opts['--'+k+'-id'])))throw Error('missing_selected_source');
  const selected=Object.fromEntries(fields.map(k=>[k,opts['--'+k.replace('Id','')+'-id']]));
  return previewInvoice(await jsonFile(opts['--input-file'],65536),selected,
    opts['--policy-file']?await jsonFile(opts['--policy-file'],16384):undefined);
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {const result=await main(process.argv.slice(2));console.log(JSON.stringify(result,null,2));process.exitCode=result.status==='within_declared_policy_for_review'?0:2;}
  catch {console.error(JSON.stringify({mode:'offline_review_only',status:'invalid_input',authorizesPayment:false,authorizesSend:false}));process.exitCode=2;}
}
