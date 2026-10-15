import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { reconcileChallenge, decodeSettlement, validateResource, publicIPv4, probeChallenge, main } from '../skills/mermail-procurement-agent/scripts/reconcile-x402.mjs';

const asset='0x'+'1'.repeat(40), payTo='0x'+'2'.repeat(40);
const env={max:'1',asset,payTo,network:'eip155:8453',decimals:6,resource:'https://vendor.example/resource'};
const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64');
const challenge=(change={}, top={})=>encode({x402Version:2,resource:{url:env.resource},accepts:[{network:env.network,asset,payTo,amount:'1000000',scheme:'exact',maxTimeoutSeconds:60,...change}],...top});

test('exact and upto compare without authorizing payment',()=>{
  for(const scheme of ['exact','upto']) {
    const r=reconcileChallenge(challenge({scheme}),env);
    assert.equal(r.verdict,'within_envelope'); assert.equal(r.selected_accepts_index,0);
    assert.equal(r.authorization,'comparison_only_not_payment_approval');
  }
});
test('required envelope dimensions fail closed',()=>{
  for(const key of Object.keys(env)) {const copy={...env}; delete copy[key]; assert.equal(reconcileChallenge(challenge(),copy).verdict,'malformed',key);}
});
test('negative, nonfinite, exponent, number and fractional base-unit inputs rejected',()=>{
  for(const amount of ['-1','NaN','Infinity','1e6','1.2','',1000000,null,'0']) assert.equal(reconcileChallenge(challenge({amount}),env).verdict,'malformed');
  for(const max of ['-1','Infinity','NaN','1e6','0',1,null]) assert.equal(reconcileChallenge(challenge(),{...env,max}).verdict,'malformed');
});
test('exact decimal comparison above Number safe integer range',()=>{
  const large={...env,decimals:0,max:'9007199254740992'};
  assert.equal(reconcileChallenge(challenge({amount:'9007199254740993'}),large).verdict,'above_cap');
  assert.equal(reconcileChallenge(challenge({amount:'9007199254740992'}),large).verdict,'within_envelope');
  assert.equal(reconcileChallenge(challenge({amount:'1000001'}),env).verdict,'above_cap');
});
test('precision and unsupported scheme/version fail closed',()=>{
  for(const decimals of [-1,37,1.1,NaN,Infinity]) assert.equal(reconcileChallenge(challenge(),{...env,decimals}).verdict,'malformed');
  assert.equal(reconcileChallenge(challenge(),{...env,max:'1.0000001'}).verdict,'malformed');
  assert.equal(reconcileChallenge(challenge({scheme:'other'}),env).verdict,'malformed');
  assert.equal(reconcileChallenge(challenge({}, {x402Version:1}),env).verdict,'malformed');
});
test('resource, network, asset and payee are independently frozen',()=>{
  assert.equal(reconcileChallenge(challenge({network:'eip155:1'}),env).verdict,'network_mismatch');
  assert.equal(reconcileChallenge(challenge({asset:payTo}),env).verdict,'asset_mismatch');
  assert.equal(reconcileChallenge(challenge({payTo:asset}),env).verdict,'payee_mismatch');
  assert.equal(reconcileChallenge(challenge({}, {resource:{url:'https://other.example/'}}),env).verdict,'resource_mismatch');
});
test('duplicate matching offers are not silently selected',()=>{
  const c=JSON.parse(Buffer.from(challenge(),'base64'));c.accepts.push({...c.accepts[0]});
  assert.equal(reconcileChallenge(encode(c),env).verdict,'malformed');
});
test('Solana identifiers retain case',()=>{
  const sol={...env,network:'solana:mainnet',asset:'A'.repeat(32),payTo:'B'.repeat(32)};
  assert.equal(reconcileChallenge(challenge({network:sol.network,asset:'a'.repeat(32),payTo:sol.payTo}),sol).verdict,'asset_mismatch');
});
test('settlement decode is explicitly unverified and carries no amount',()=>{
  const r=decodeSettlement(encode({success:true,transaction:'claim'}));assert.equal(r.verified,false);assert.equal(r.verdict,'settlement_reported');
});
test('resource validation rejects unsafe destinations before network',()=>{
  for(const url of ['http://vendor.example','https://127.0.0.1','https://[::1]','https://localhost','https://x.internal','https://a:b@vendor.example','https://vendor.example:8443','https://vendor.example/#token']) assert.throws(()=>validateResource(url));
});
test('private, special and IPv6 resolutions are blocked',()=>{
  for(const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','100.64.0.1','172.16.0.1','192.168.0.1','192.0.2.1','198.18.0.1','203.0.113.1','224.0.0.1','::1']) assert.equal(publicIPv4(ip),false,ip);
});
test('private DNS causes no request',async()=>{
  let calls=0;await assert.rejects(probeChallenge(env.resource,{lookup:async()=>[{address:'127.0.0.1',family:4}],request:()=>{calls++;}}));assert.equal(calls,0);
});
function fakeNetwork(status, body='{}', headers={}) {
  let calls=0;
  return { get calls(){return calls;}, lookup:async()=>[{address:'8.8.8.8',family:4}], request:(url,options,callback)=>{
    calls++;assert.equal(url.href,env.resource);assert.equal(options.method,'GET');
    options.lookup(url.hostname,{},(error,address)=>{assert.equal(error,null);assert.equal(address,'8.8.8.8');});
    const req=new EventEmitter();req.destroy=error=>{req.emit('error',error);req.emit('close');};
    req.end=()=>queueMicrotask(()=>{const res=Readable.from([Buffer.from(body)]);res.statusCode=status;res.headers=headers;callback(res);res.on('end',()=>req.emit('close'));});return req;
  }};
}
test('redirect never triggers another request',async()=>{
  const net=fakeNetwork(302,'',{location:'https://other.example'});await assert.rejects(probeChallenge(env.resource,net));assert.equal(net.calls,1);
});
test('bounded 402 probe returns only challenge, not paid content',async()=>{
  const net=fakeNetwork(402,'{}',{'payment-required':challenge()});assert.equal(await probeChallenge(env.resource,net),challenge());assert.equal(net.calls,1);
});
test('oversize response rejected',async()=>{
  await assert.rejects(probeChallenge(env.resource,fakeNetwork(402,'a'.repeat(65537))));
});
test('CLI rejects implicit URL, POST, incomplete envelope and mixed decode/probe',async()=>{
  for(const args of [[env.resource],['--method','POST'],['--probe'],['--response',encode({success:true}),'--probe']]) await assert.rejects(main(args));
});
test('CLI accepts only canonical explicit decimal precision',async()=>{
  const args=['--required',challenge(),'--max',env.max,'--asset',asset,'--network',env.network,'--pay-to',payTo,'--resource',env.resource,'--decimals'];
  for(const decimals of ['', ' ', '\t', '6e0', '+6', '06', '6.0', '-0', '37']) await assert.rejects(main([...args,decimals]),/canonical integer/);
  for(const decimals of ['0','6','36']) assert.equal((await main([...args,decimals])).verdict,decimals==='0'?'above_cap':'within_envelope');
});
test('self-check cannot silently replace an actual request',async()=>{
  assert.equal((await main(['--self-check'])).verdict,'self_check_pass');
  for(const extra of [['--probe'],['--required',challenge()],['--response',encode({success:true})],['--decimals','6']]) await assert.rejects(main(['--self-check',...extra]),/separate offline operation/);
});
