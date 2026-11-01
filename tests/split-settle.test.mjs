import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {settleLedger} from '../skills/mermail-split-desk/scripts/settle.mjs';

const cents = text => { const negative = text.startsWith('-'); const [whole,frac] = text.replace(/^-/, '').split('.'); return (BigInt(whole)*100n+BigInt(frac))*(negative?-1n:1n); };
const money = n => `${n/100n}.${String(n%100n).padStart(2,'0')}`;
function inputFor(values) {
  const members=values.map((_,i)=>`member-${i}`), positives=values.map((v,i)=>({i,v})).filter(x=>x.v>0), negatives=values.map((v,i)=>({i,v:-v})).filter(x=>x.v>0), lines=[];
  for(const p of positives) for(const n of negatives) if(p.v&&n.v){const amount=Math.min(p.v,n.v);lines.push({id:`receipt-${lines.length}`,payer:members[p.i],amount:money(BigInt(amount)),split:[members[n.i]]});p.v-=amount;n.v-=amount;}
  return {currency:'USD',owner:members[0],members,lines};
}
function check(result) {
  const balances=new Map(result.balances.map(b=>[b.member,cents(b.balance)]));
  assert.equal([...balances.values()].reduce((a,b)=>a+b,0n),0n);
  for(const t of result.transfers){const value=cents(t.amount);assert.ok(value>0n);assert.notEqual(t.from,t.to);assert.ok(balances.has(t.from)&&balances.has(t.to));balances.set(t.from,balances.get(t.from)+value);balances.set(t.to,balances.get(t.to)-value);}
  assert.ok([...balances.values()].every(v=>v===0n));
}
// Independent exhaustive debt-cancellation oracle, not the subset DP used by
// the shipped implementation. Restricted to small generated groups for tests.
function oracle(values) {
  const debt=values.filter(v=>v!==0);
  const search=start=>{while(start<debt.length&&!debt[start])start++;if(start===debt.length)return 0;let best=Infinity;const seen=new Set();for(let j=start+1;j<debt.length;j++)if(debt[j]*debt[start]<0&&!seen.has(debt[j])){const old=debt[j];seen.add(old);debt[j]+=debt[start];best=Math.min(best,1+search(start+1));debt[j]=old;}return best;};
  return search(0);
}
test('finds three transfers instead of the original four-transfer greedy counterexample',()=>{
  const result=settleLedger(inputFor([600,400,-400,-300,-300]));
  assert.equal(result.transfers.length,3);assert.equal(result.optimization.exact,true);check(result);
});
test('exact minimum agrees with independent exhaustive oracle on 300 deterministic groups',()=>{
  let seed=173;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
  for(let k=0;k<300;k++){const n=2+rand()%7,values=Array.from({length:n-1},()=>Number(rand()%19)-9);values.push(-values.reduce((a,b)=>a+b,0));const result=settleLedger(inputFor(values));assert.equal(result.transfers.length,oracle(values),JSON.stringify(values));check(result);assert.deepEqual(settleLedger(inputFor(values)),result);}
});
test('retains worked receipt example and deterministic roster-order penny allocation',()=>{
  const input={currency:'USD',owner:'Oliver',members:['Oliver','Alice','Bob'],lines:[{id:'a',payer:'Alice',amount:'18.00'},{id:'b',payer:'Oliver',amount:'4.50'},{id:'c',payer:'Bob',amount:'6.00',split:['Alice','Bob']},{id:'d',payer:'Bob',amount:'3.30'}]};
  const result=settleLedger(input);assert.deepEqual(result.balances.map(b=>b.balance),['-4.10','6.40','-2.30']);check(result);
  input.lines=[{id:'penny',payer:'Bob',amount:'0.01'}];assert.deepEqual(settleLedger(input).balances.map(b=>b.balance),['-0.01','0.00','0.01']);
});
test('large exact decimal strings, zero expenses and prototype-like names stay exact',()=>{
  const input={currency:'USD',owner:'__proto__',members:['__proto__','constructor'],lines:[{id:'large',payer:'__proto__',amount:'90071992547409931234567890.01',split:['constructor']}]};
  const result=settleLedger(input);assert.equal(result.transfers[0].amount,'90071992547409931234567890.01');check(result);
  input.lines=[{id:'free',payer:'__proto__',amount:'0.00'}];assert.equal(settleLedger(input).transfers.length,0);
});
test('rejects duplicate source IDs, roster and sharers; unknown parties and mixed currencies',()=>{
  const base=inputFor([100,-100]);
  for(const input of [{...base,lines:[...base.lines,...base.lines]},{...base,members:['member-0','member-0']},{...base,owner:'missing'},...[[base.members[0],base.members[0]],[],null,['unknown'],'member-0'].map(split=>({...base,lines:[{...base.lines[0],split}]})),{...base,lines:[{...base.lines[0],payer:'unknown'}]},{...base,lines:[{...base.lines[0],id:''}]},{...base,lines:[{...base.lines[0],currency:'EUR'}]}])assert.throws(()=>settleLedger(input));
});
test('rejects non-decimal, numeric, excess-precision or overlong money without silent coercion',()=>{
  for(const amount of [1,Infinity,null,'-1','+1','1e2','01','1.001',' 1','1.','1.0.9','9'.repeat(65)]){const input=inputFor([1,-1]);input.lines[0].amount=amount;assert.throws(()=>settleLedger(input));}
});
test('enforces explicit computation bounds without returning an unproven plan',()=>{
  const boundary=settleLedger(inputFor([...Array(9).fill(1),...Array(9).fill(-1)]));assert.equal(boundary.transfers.length,9);check(boundary);
  assert.throws(()=>settleLedger(inputFor([...Array(10).fill(1),...Array(10).fill(-1)])),/18 nonzero/);
  assert.throws(()=>settleLedger({...inputFor([1,-1]),lines:Array.from({length:101},(_,i)=>({id:String(i),payer:'member-0',amount:'0'}))}),/100 approved/);
  assert.equal(settleLedger({currency:'USD',owner:'m0',members:Array.from({length:100},(_,i)=>`m${i}`),lines:[]}).transfers.length,0);
});
test('actual CLI emits exact JSON once; invalid ledger exits nonzero with no plan',()=>{
  const script=fileURLToPath(new URL('../skills/mermail-split-desk/scripts/settle.mjs',import.meta.url));
  const run=input=>spawnSync(process.execPath,[script],{input,encoding:'utf8',maxBuffer:2e6});
  const valid=run(JSON.stringify(inputFor([600,400,-400,-300,-300])));assert.equal(valid.status,0,valid.stderr);assert.equal(JSON.parse(valid.stdout).transfers.length,3);
  for(const input of ['{',JSON.stringify({}), 'x'.repeat(1024*1024+1)]){const invalid=run(input);assert.equal(invalid.status,1);assert.equal(invalid.stdout,'');assert.ok(invalid.stderr);}
  const privateInput=run('{"customer_secret_marker": [}');assert.equal(privateInput.status,1);assert.doesNotMatch(privateInput.stderr,/customer_secret_marker/);assert.match(privateInput.stderr,/invalid ledger JSON/);
});
