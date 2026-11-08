#!/usr/bin/env node
// Offline arithmetic and supplied-record binding only. No network or writes.
import {readFile,lstat,realpath} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const keys=['workspaceId','mailboxId','legalEntityId','customerId','invoiceId','version'];
const id=x=>typeof x==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,127}$/.test(x);
const time=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(x)&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString()===x.replace(/Z$/,x.includes('.')?'Z':'.000Z');
const match=(a,b)=>a&&b&&keys.every(k=>id(a[k])&&a[k]===b[k]);
function units(value,decimals){
  if(typeof value!=='string'||value.length>100||!/^(0|[1-9]\d*)(?:\.\d+)?$/.test(value))throw Error('invalid_amount');
  const [w,f='']=value.split('.');if(f.length>decimals)throw Error('unsupported_precision');
  return BigInt(w+f.padEnd(decimals,'0'));
}
export function previewReceivable(input,selected){
  const base={mode:'offline_receivable_review',authorizesSend:false,authorizesPayment:false,authorizesLedgerWrite:false,execution:'not_attempted',provenanceVerified:false};
  const held=reason=>({...base,status:'held',reasons:[reason]});
  const i=input?.invoice,e=input?.evidence;
  if(!match(selected,i?.scope))return held('scope_missing_or_mismatched');
  const scope=Object.fromEntries(keys.map(k=>[k,selected[k]]));
  if(i.direction!=='receivable'||i.ownerConfirmed!==true)return held('independent_receivable_terms_required');
  if(!/^[A-Z][A-Z0-9]{2,11}$/.test(i.currency??'')||!['assetId','chainId','destination'].every(k=>id(i[k]))||!Number.isInteger(i.decimals)||i.decimals<0||i.decimals>36)return held('explicit_asset_terms_required');
  try{
    const total=units(i.total,i.decimals);
    if(total<=0n||!Array.isArray(i.lineTotals)||i.lineTotals.length<1||i.lineTotals.length>25)return held('positive_bounded_line_totals_required');
    const rows=i.lineTotals.map(x=>units(x,i.decimals));
    if(rows.some(x=>x<=0n)||rows.reduce((a,b)=>a+b,0n)!==total)return held('line_total_mismatch');
    if(e?.ownerConfirmed!==true||e.completeForInvoice!==true||!time(e.asOf)||!Array.isArray(e.receipts)||e.receipts.length>50)return held('complete_independent_allocation_record_required');
    const reasons=new Set(),seen=new Set(),references=new Set();let received=0n,alreadyAllocated=0n;
    for(const r of e.receipts){
      if(!r||!id(r.id)||seen.has(r.id)){reasons.add('duplicate_or_missing_receipt_id');continue;}seen.add(r.id);
      if(!match(selected,r.scope)||!['currency','assetId','chainId','destination'].every(k=>r[k]===i[k])){reasons.add('receipt_binding_mismatch');continue;}
      if(r.provenanceReviewed!==true||!id(r.sourceRef)||!time(r.verifiedAt)||Date.parse(r.verifiedAt)>Date.parse(e.asOf)){reasons.add('independent_terminal_evidence_required');continue;}
      if(references.has(r.sourceRef)){reasons.add('duplicate_settlement_reference');continue;}references.add(r.sourceRef);
      if(r.state!=='settled'){reasons.add('not_terminal_settlement');continue;}
      if(!['unallocated','recorded_this_invoice'].includes(r.allocationStatus)){reasons.add('already_allocated_or_uncertain');continue;}
      const amount=units(r.amount,i.decimals);if(amount<=0n){reasons.add('nonpositive_receipt');continue;}received+=amount;if(r.allocationStatus==='recorded_this_invoice')alreadyAllocated+=amount;
    }
    if(reasons.size)return {...base,scope,status:'held',reasons:[...reasons]};
    const outstanding=received<total?total-received:0n,excess=received>total?received-total:0n;
    return {...base,scope,status:excess>0n?'excess_for_review':outstanding>0n?'partial_or_unreceived_for_review':'matches_declared_total_for_review',reasons:[],declaredTotalUnits:total.toString(),declaredReceivedUnits:received.toString(),alreadyAllocatedUnits:alreadyAllocated.toString(),newCandidateUnits:(received-alreadyAllocated).toString(),outstandingUnits:outstanding.toString(),excessUnits:excess.toString(),next:'independent_evidence_and_atomic_allocation_then_exact_receipt_review'};
  }catch{return held('invalid_amount_or_precision');}
}
export async function main(args){
  const flags=['--input-file','--workspace-id','--mailbox-id','--legal-entity-id','--customer-id','--invoice-id','--version'],opts={};
  for(let n=0;n<args.length;n++){const k=args[n];if(!flags.includes(k)||k in opts||!args[n+1]||args[n+1].startsWith('--'))throw Error('invalid_argument');opts[k]=args[++n];}
  if(!opts['--input-file'])throw Error('missing_input');
  const file=resolve(opts['--input-file']),s=await lstat(file);
  if(!s.isFile()||s.isSymbolicLink()||s.size>65536||await realpath(file)!==file)throw Error('invalid_file');
  const bytes=await readFile(file);if(bytes.length>65536)throw Error('invalid_file');
  const selected=Object.fromEntries(keys.map((k,n)=>[k,opts[flags[n+1]]]));
  return previewReceivable(JSON.parse(bytes.toString('utf8')),selected);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{const result=await main(process.argv.slice(2));console.log(JSON.stringify(result,null,2));process.exitCode=result.status==='held'?2:0;}
  catch{console.error(JSON.stringify({mode:'offline_receivable_review',status:'invalid_input',authorizesSend:false,authorizesPayment:false,authorizesLedgerWrite:false}));process.exitCode=2;}
}
