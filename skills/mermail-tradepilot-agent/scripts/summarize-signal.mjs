import {readFileSync, statSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

const decimal=(value,label,zero=false)=>{
  if(typeof value!=='string'||!/^\d{1,64}(?:\.\d{1,18})?$/.test(value))throw Error(`${label}: use a bounded plain decimal string`);
  const [whole,frac='']=value.split('.'),n=BigInt(whole+frac),d=10n**BigInt(frac.length);
  if(n<0n||(!zero&&n===0n))throw Error(`${label}: must be positive`);
  return {n,d};
};
const compare=(a,b)=>a.n*b.d-b.n*a.d;
const gcd=(a,b)=>{while(b){[a,b]=[b,a%b];}return a;};
const ratio=(n,d)=>{
  const g=gcd(n,d);n/=g;d/=g;
  const scaled=n*10000n/d;
  return {numerator:String(n),denominator:String(d),display:`${scaled/10000n}.${String(scaled%10000n).padStart(4,'0')}`,displayPrecision:4,displayIsTruncated:n*10000n%d!==0n};
};

export function summarizeSignal(input){
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Expected one signal object');
  const allowed=new Set(['direction','entry','stopLoss','takeProfit','maxStopDistancePercent','thresholdComparison']);
  if(Object.keys(input).some(k=>!allowed.has(k)))throw Error('Unexpected signal field');
  if(!['long','short'].includes(input.direction))throw Error('direction: explicit long or short required');
  const entry=decimal(input.entry,'entry'),stop=decimal(input.stopLoss,'stopLoss');
  const stopSide=compare(stop,entry);
  if((input.direction==='long'&&stopSide>=0n)||(input.direction==='short'&&stopSide<=0n))throw Error('Stop is on the wrong side of entry');
  let target;
  if(input.takeProfit!==undefined){
    const tp=decimal(input.takeProfit,'takeProfit'),side=compare(tp,entry);
    if((input.direction==='long'&&side<=0n)||(input.direction==='short'&&side>=0n))throw Error('Take profit is on the wrong side of entry');
    target=input.takeProfit;
  }
  const delta=stopSide<0n?-stopSide:stopSide;
  const n=delta*100n,d=entry.n*stop.d;
  let thresholdStatus='not_supplied';
  if(input.maxStopDistancePercent!==undefined){
    const t=decimal(input.maxStopDistancePercent,'maxStopDistancePercent',true);
    if(!['lt','lte'].includes(input.thresholdComparison))throw Error('Explicit lt or lte threshold comparison required');
    const difference=n*t.d-t.n*d;
    thresholdStatus=(input.thresholdComparison==='lt'?difference<0n:difference<=0n)?'within_user_threshold':'outside_user_threshold';
  }else if(input.thresholdComparison!==undefined)throw Error('Comparison without threshold');
  return {kind:'unverified_signal_arithmetic',direction:input.direction,claimedEntry:input.entry,claimedStopLoss:input.stopLoss,...(target===undefined?{}:{claimedTakeProfit:target}),stopDistancePercent:ratio(n,d),thresholdStatus,...(input.maxStopDistancePercent===undefined?{}:{userThresholdPercent:input.maxStopDistancePercent,thresholdComparison:input.thresholdComparison}),executionAuthorized:false};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    if(process.argv.length!==3)throw Error('Usage: node summarize-signal.mjs selected-signal.json');
    if(statSync(process.argv[2]).size>65536)throw Error('Input exceeds 64 KiB');
    console.log(JSON.stringify(summarizeSignal(JSON.parse(readFileSync(process.argv[2],'utf8'))),null,2));
  }catch(error){console.error(error.message);process.exitCode=1;}
}
