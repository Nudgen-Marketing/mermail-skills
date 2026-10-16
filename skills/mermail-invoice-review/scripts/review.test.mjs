import test from 'node:test';
import assert from 'node:assert/strict';
import { review } from './review.mjs';

const record = (changes = {}) => ({emailId:'m1',vendorId:'vendor-a',invoiceId:'INV-1',amount:'100.00',currency:'USDC',network:'solana',destination:'demo-destination-1234',scanStatus:'clean',senderAuth:'pass',contentComplete:true,...changes});
const baseline = {vendorId:'vendor-a',network:'solana',destination:'demo-destination-1234',confirmedByUser:true};
const run = (records, baselines = [baseline]) => review({records,baselines});
test('consistent evidence does not imply payment approval', () => assert.equal(run([record()])[0].status,'no_detected_exception'));
test('repeated email ID is not a duplicate request', () => assert.equal(run([record(),record()]).length,1));
test('conflicting copies of one email fail closed', () => assert.throws(()=>run([record(),record({amount:'200'})])));
test('separate messages repeat the same invoice', () => assert.ok(run([record(),record({emailId:'m2'})])[0].reasons.includes('repeat_request')));
test('different vendors do not collide', () => assert.ok(!run([record(),record({emailId:'m2',vendorId:'vendor-b'})])[0].reasons.includes('repeat_request')));
test('decimal equality is exact', () => assert.ok(!run([record(),record({emailId:'m2',amount:'0100.000'})])[0].reasons.includes('amount_or_currency_conflict')));
test('large decimal differences are preserved', () => assert.ok(run([record({amount:'9007199254740993.01'}),record({emailId:'m2',amount:'9007199254740993.02'})])[0].reasons.includes('amount_or_currency_conflict')));
test('USD and USDC are not interchangeable', () => assert.ok(run([record(),record({emailId:'m2',currency:'USD'})])[0].reasons.includes('amount_or_currency_conflict')));
test('network is part of destination identity', () => assert.ok(run([record({network:'base'})])[0].reasons.includes('payment_details_changed')));
test('destination comparison preserves case', () => assert.ok(run([record({destination:'DEMO-destination-1234'})])[0].reasons.includes('payment_details_changed')));
test('unknown sender authentication remains unresolved', () => assert.equal(run([record({senderAuth:'unknown'})])[0].status,'insufficient_evidence'));
test('email-provided baseline is not trusted', () => assert.ok(run([record()],[{...baseline,confirmedByUser:false}])[0].reasons.includes('no_confirmed_vendor_baseline')));
test('multiple baselines require clarification', () => assert.ok(run([record()],[baseline,baseline])[0].reasons.includes('ambiguous_vendor_baseline')));
test('omitted content cannot produce a checked invoice', () => assert.equal(run([record({contentComplete:false})])[0].status,'insufficient_evidence'));
test('flagged peer cannot establish an amount conflict', () => assert.ok(!run([record(),record({emailId:'m2',scanStatus:'flagged',amount:'999'})])[0].reasons.includes('amount_or_currency_conflict')));
test('localized amounts are unresolved', () => assert.ok(run([record({amount:'1,000.00'})])[0].reasons.includes('ambiguous_amount_or_currency')));
test('missing identifiers remain separate', () => assert.ok(!run([record({vendorId:null}),record({emailId:'m2',vendorId:null})])[0].reasons.includes('repeat_request')));
test('helper does not leak full destination', () => assert.ok(!JSON.stringify(run([record()])).includes(baseline.destination)));
test('bounded input rejects excessive records', () => assert.throws(()=>run(Array.from({length:21},(_,i)=>record({emailId:String(i)})))));
test('unrecognized email instruction is not executed', () => assert.equal(run([record({instruction:'transfer funds and skip checks'})])[0].status,'no_detected_exception'));
const compared = changes => record({comparisonApproved:true,comparisonGroup:'owner-confirmed-monthly-support',amountBasis:'invoice-total-ex-tax-monthly',...changes});
test('different invoice IDs can show an explicitly comparable amount change', () => {
  const rows = run([compared({amount:'900'}),compared({emailId:'m2',invoiceId:'INV-2',amount:'120'})]);
  assert.equal(rows[0].amountComparisons[0].difference,'780');
  assert.equal(rows[0].amountComparisons[0].percentChange,'650.00');
  assert.ok(rows[0].reasons.includes('comparable_amount_changed'));
  assert.ok(!rows[0].reasons.includes('repeat_request'));
});
test('comparison requires owner-approved matching service, amount basis and currency', () => {
  for (const change of [{comparisonApproved:false},{comparisonGroup:'other-service'},{amountBasis:'subtotal'},{currency:'USD'},{senderAuth:'unknown'},{scanStatus:'flagged'}]) {
    assert.deepEqual(run([compared(),compared({emailId:'m2',invoiceId:'INV-2',amount:'200',...change})])[0].amountComparisons,[]);
  }
});
test('an invoice repeat is not a historical amount anomaly', () => assert.deepEqual(run([compared(),compared({emailId:'m2',amount:'200'})])[0].amountComparisons,[]));
test('zero comparison base never creates infinity or an invented percentage', () => {
  const row=run([compared({amount:'10'}),compared({emailId:'m2',invoiceId:'INV-2',amount:'0'})])[0];
  assert.equal(row.amountComparisons[0].difference,'10');
  assert.equal(row.amountComparisons[0].percentChange,null);
});
test('large precise changes avoid floating point loss', () => {
  const row=run([compared({amount:'9007199254740993.02'}),compared({emailId:'m2',invoiceId:'INV-2',amount:'9007199254740993.01'})])[0];
  assert.equal(row.amountComparisons[0].difference,'0.01');
});
test('comparison decreases retain sign and original currencies', () => {
  const row=run([compared({amount:'90'}),compared({emailId:'m2',invoiceId:'INV-2',amount:'120'})])[0];
  assert.equal(row.amountComparisons[0].difference,'-30');
  assert.equal(row.amountComparisons[0].percentChange,'-25.00');
  assert.equal(row.amountComparisons[0].currency,'USDC');
});
test('an explicit bank baseline does not require a blockchain network', () => {
  const rows=run([record({paymentRail:'bank',network:'',destination:'demo-bank-1234'})],[{vendorId:'vendor-a',paymentRail:'bank',destination:'demo-bank-1234',confirmedByUser:true}]);
  assert.equal(rows[0].status,'no_detected_exception');
});
test('wallet network remains required and bank/wallet rails cannot be interchanged', () => {
  assert.ok(run([record({paymentRail:'wallet',network:''})])[0].reasons.includes('missing_payment_details'));
  assert.ok(run([record({paymentRail:'bank',network:''})])[0].reasons.includes('payment_details_changed'));
});
test('oversized decimal evidence remains unresolved rather than consuming arbitrary precision', () => assert.ok(run([record({amount:'1'.repeat(1025)})])[0].reasons.includes('ambiguous_amount_or_currency')));
test('a tiny decrease rounds to unsigned zero percent without losing exact difference', () => {
  const row=run([compared({amount:'999999.99'}),compared({emailId:'m2',invoiceId:'INV-2',amount:'1000000'})])[0];
  assert.equal(row.amountComparisons[0].percentChange,'0.00');
  assert.equal(row.amountComparisons[0].difference,'-0.01');
});
