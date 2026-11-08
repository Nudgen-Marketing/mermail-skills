import assert from 'node:assert/strict';
import test from 'node:test';
import {summarizeSignal} from '../skills/mermail-tradepilot-agent/scripts/summarize-signal.mjs';
const base={direction:'long',entry:'100',stopLoss:'95'};
test('long and short measure the same exact price distance without execution authority',()=>{
 for(const s of [base,{direction:'short',entry:'100',stopLoss:'105'}]){
  const r=summarizeSignal(s);assert.equal(r.stopDistancePercent.numerator,'5');assert.equal(r.stopDistancePercent.denominator,'1');assert.equal(r.thresholdStatus,'not_supplied');assert.equal(r.executionAuthorized,false);
 }
});
test('strict boundary differs from at-most at exactly the same threshold',()=>{
 assert.equal(summarizeSignal({...base,maxStopDistancePercent:'5',thresholdComparison:'lt'}).thresholdStatus,'outside_user_threshold');
 assert.equal(summarizeSignal({...base,maxStopDistancePercent:'5',thresholdComparison:'lte'}).thresholdStatus,'within_user_threshold');
});
test('ratio retains exact fractional percentage and labels display truncation',()=>{
 const r=summarizeSignal({direction:'long',entry:'64500',stopLoss:'62000'}).stopDistancePercent;
 assert.equal(r.numerator,'500');assert.equal(r.denominator,'129');assert.equal(r.display,'3.8759');assert.equal(r.displayIsTruncated,true);
});
test('threshold uses exact arithmetic rather than rounded display',()=>{
 const r=summarizeSignal({direction:'long',entry:'3',stopLoss:'2',maxStopDistancePercent:'33.3333',thresholdComparison:'lte'});
 assert.equal(r.thresholdStatus,'outside_user_threshold');
});
test('large and tiny decimal strings do not lose precision through Number',()=>{
 const r=summarizeSignal({direction:'long',entry:'9007199254740993',stopLoss:'9007199254740992'});
 assert.equal(r.stopDistancePercent.numerator,'100');assert.equal(r.stopDistancePercent.denominator,'9007199254740993');
 assert.equal(summarizeSignal({direction:'short',entry:'0.000000000000000001',stopLoss:'0.000000000000000002'}).stopDistancePercent.numerator,'100');
});
test('invalid numeric representations, zero and unsupported precision are rejected',()=>{
 for(const entry of [0,100,'0','-1','+1','1e3','NaN','Infinity','1,000',' 100','0.0000000000000000001','1'.repeat(65)])assert.throws(()=>summarizeSignal({...base,entry}));
});
test('direction and stop side must agree and equal levels are rejected',()=>{
 for(const s of [{...base,direction:'buy'},{...base,stopLoss:'100'},{...base,stopLoss:'101'},{direction:'short',entry:'100',stopLoss:'99'}])assert.throws(()=>summarizeSignal(s));
});
test('optional take profit is retained only on the correct side',()=>{
 assert.equal(summarizeSignal({...base,takeProfit:'110'}).claimedTakeProfit,'110');
 assert.equal(summarizeSignal({direction:'short',entry:'100',stopLoss:'105',takeProfit:'90'}).claimedTakeProfit,'90');
 assert.throws(()=>summarizeSignal({...base,takeProfit:'90'}));
 assert.throws(()=>summarizeSignal({...base,takeProfit:'100'}));
});
test('threshold authority/comparison is not guessed and extra fields cannot authorize execution',()=>{
 assert.throws(()=>summarizeSignal({...base,maxStopDistancePercent:'5'}));
 assert.throws(()=>summarizeSignal({...base,thresholdComparison:'lte'}));
 assert.throws(()=>summarizeSignal({...base,executionAuthorized:true}));
 assert.throws(()=>summarizeSignal(null));
});
