// Actual helper boundaries with synthetic projections and injected transports.
// No Mermail, mail send, wallet, provider or network effect.
import assert from "node:assert/strict";
import test from "node:test";
import {verifySelectedEmailEvidence} from "../skills/mermail-freelance-margin-guard/scripts/build-margin-packet.mjs";
import {findMessage, resolveEmailMetadata, resolveSelectedEmailEvidence, retryReadOperation, SafeError}
  from "../skills/mermail-freelance-margin-guard/scripts/run-live-proof.mjs";

const subject="[FMG-LIVE-offline] Accepted scope";
const metadata=(id="source-1",folder="Inbox")=>({id,subject,folder_id:folder,date:"2026-10-01T12:00:00Z"});
const selected=()=>({...metadata(),body:"One responsive landing page is the accepted scope.",
  scan_status:"clean",agent_safe_content:true});
const input=email=>({sources:[{id:"baseline",type:"email",messageId:email.id,date:"2026-10-01",quote:email.body}]});
const counter=()=>({next:()=>1});
const noSleep=async()=>{throw Error("Unexpected poll/backoff after terminal evidence");};

test("native storage, omission and truncation failures reject real evidence gates in both copy orders",()=>{
  for(const change of [{body_storage_status:"deleted"},{body_storage_status:"unavailable"},
    {body_storage_status:null},{body_storage_status:"unknown"},{body_truncated:true},
    {body_truncated:"false"},{content_omitted:null},{content_truncated:null},
    {content_omission_reason:"body_unavailable"},{body_original_char_count:10000}]) {
    const safe=selected(), unsafe={...safe,...change};
    assert.throws(()=>verifySelectedEmailEvidence(input(safe),[{tool:"get_email",email:unsafe}]));
    assert.throws(()=>resolveSelectedEmailEvidence([{email:unsafe}],safe.id,[]));
    for(const copies of [[safe,unsafe],[unsafe,safe]])
      assert.throws(()=>resolveSelectedEmailEvidence(copies.map(email=>({email})),safe.id,[]));
  }
});

test("current optional-positive native markers preserve complete safe reads and safe Sent context",()=>{
  const email=selected();
  assert.equal(verifySelectedEmailEvidence(input(email),[{tool:"get_email",email}]).valid,true);
  const explicit={...email,content_omitted:false,content_truncated:false,body_truncated:false,
    body_original_char_count:email.body.length,body_storage_status:"available"};
  assert.equal(resolveSelectedEmailEvidence([{email:explicit}],email.id,[]).email.id,email.id);
  const sent={...email,folder_id:"Sent",scan_status:null,is_incoming:false};
  assert.equal(resolveSelectedEmailEvidence([{email:sent}],email.id,[],"get_email_context").email.id,email.id);
  assert.throws(()=>resolveSelectedEmailEvidence([{email:sent}],email.id,[],"get_email"));
});

test("a positive pagination gap cannot establish singleton selection",()=>{
  for(const pagination of [{has_more:true},{hasMore:true},{next_cursor:"next"},{totalCount:2}])
    assert.throws(()=>resolveEmailMetadata([{emails:[metadata()],...pagination}],subject),/incomplete/);
});

test("actual discovery reads remaining pages before choosing or rejecting a candidate",async()=>{
  for(const secondFolder of ["Inbox","Sent"]){
    const calls=[];
    const discover=findMessage("synthetic",counter(),"mailbox",subject,{sleepFn:noSleep,
      callToolFn:async(_key,_counter,name,args)=>{
        calls.push({name,page:args.query.page});
        return [{emails:[metadata(`source-${args.query.page}`,args.query.page===1?"Inbox":secondFolder)],
          totalCount:2,has_more:args.query.page===1}];
      }});
    if(secondFolder==="Inbox") await assert.rejects(discover,/message-selection/);
    else assert.equal((await discover).id,"source-1");
    assert.deepEqual(calls,[{name:"search_emails",page:1},{name:"search_emails",page:2}]);
  }
});

test("resume listing likewise cannot select a first-page singleton before a later duplicate",async()=>{
  let calls=0;
  await assert.rejects(findMessage("synthetic",counter(),"mailbox",subject,{resumeOnly:true,sleepFn:noSleep,
    callToolFn:async(_key,_counter,name,args)=>{
      calls++;assert.equal(name,"list_emails");
      return [{emails:[metadata(`source-${args.query.page}`)],totalCount:2}];
    }}),/message-selection/);
  assert.equal(calls,2);
});

test("unknown, changed, repeated and exhausted discovery coverage stops without another tool",async()=>{
  for(const mode of ["unknown","changed","repeated","exhausted","cursor"]){
    let calls=0;
    await assert.rejects(findMessage("synthetic",counter(),"mailbox",subject,{sleepFn:noSleep,
      callToolFn:async(_key,_counter,name,args)=>{
        calls++;assert.equal(name,"search_emails");
        const page=args.query.page;
        const value={emails:[metadata(mode==="repeated"?"same":`source-${page}`)]};
        if(mode!=="unknown") value.totalCount=mode==="changed"?page+1:mode==="exhausted"?11:2;
        if(mode==="cursor") value.next_cursor="opaque";
        return [value];
      }}),/message-discovery/);
    assert.equal(calls,mode==="exhausted"?10:["changed","repeated"].includes(mode)?2:1);
  }
});

test("native structured/text duplicate metadata copies remain usable after complete coverage",async()=>{
  const page={emails:[metadata()],totalCount:1};
  const value=await findMessage("synthetic",counter(),"mailbox",subject,{sleepFn:noSleep,
    callToolFn:async()=>[page,structuredClone(page)]});
  assert.equal(value.id,"source-1");
});

test("only explicitly transient read failures retry, never hard status or generic tool errors",async()=>{
  for(const status of [401,402,403,429]){
    let calls=0,sleeps=0;
    await assert.rejects(retryReadOperation(async()=>{calls++;throw new SafeError(`http-${status}`,{status,retryable:true});},
      {sleepFn:async()=>{sleeps++;},baseDelayMs:0}));
    assert.equal(calls,1);assert.equal(sleeps,0);
  }
  let calls=0;
  await assert.rejects(retryReadOperation(async()=>{calls++;throw new SafeError("tool-result");},{sleepFn:noSleep}));
  assert.equal(calls,1);
  const delays=[];calls=0;
  assert.equal(await retryReadOperation(async()=>{if(++calls<3)throw new SafeError("network",{retryable:true});return "read";},
    {baseDelayMs:1,sleepFn:async ms=>delays.push(ms)}),"read");
  assert.deepEqual(delays,[1,2]);
});

test("actual HTTP hard failures and MCP rate errors stop discovery after one request",async()=>{
  const originalFetch=globalThis.fetch;
  try{
    for(const status of [401,402,403,429]){
      let calls=0;
      globalThis.fetch=async()=>{calls++;return {ok:false,status,headers:{get:()=>"60"}};};
      await assert.rejects(findMessage("synthetic",counter(),"mailbox",subject,{sleepFn:noSleep}),error=>{
        assert.equal(error.status,status);assert.equal(error.retryAfter,"60");return true;
      });
      assert.equal(calls,1);
    }
    let calls=0;
    globalThis.fetch=async(_url,options)=>{
      calls++;const request=JSON.parse(options.body);
      return {ok:true,status:200,json:async()=>({jsonrpc:"2.0",id:request.id,result:{isError:true,
        structuredContent:{code:"rate_limit_exceeded",error:"Too many requests"}}})};
    };
    await assert.rejects(findMessage("synthetic",counter(),"mailbox",subject,{sleepFn:noSleep}),/tool-result/);
    assert.equal(calls,1);
  }finally{globalThis.fetch=originalFetch;}
});
