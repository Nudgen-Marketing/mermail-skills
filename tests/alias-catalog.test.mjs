import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
const root=new URL('../',import.meta.url);
const coverage=JSON.parse(readFileSync(new URL('tool-coverage.json',root)));
const compatibility=JSON.parse(readFileSync(new URL('compatibility.json',root)));
const scenarios=JSON.parse(readFileSync(new URL('tests/scenarios.json',root)));
const aliases=['list_mailbox_aliases','save_mailbox_alias','update_mailbox_alias','remove_mailbox_alias'];
const business=Object.values(coverage.domains).flat(),full=[coverage.confirmationTool,...business];
test('four aliases each belong only to administration; counts include confirmation separately',()=>{
 for(const name of aliases){assert.ok(coverage.domains['mermail-administer-workspace'].includes(name));assert.equal(business.filter(x=>x===name).length,1);assert.equal(Object.values(coverage.walletScopedDomains).flat().includes(name),false);}
 assert.equal(business.length,86);assert.equal(full.length,87);assert.equal(compatibility.catalog.businessTools,86);assert.equal(compatibility.catalog.confirmationTools,1);assert.equal(compatibility.catalog.walletScopedTools,23);assert.equal(compatibility.catalog.skills,17);
});
test('only update alias is destructive; save/remove do not invent native send or wallet risk',()=>{
 for(const name of aliases){assert.equal(coverage.destructiveTools.includes(name),name==='update_mailbox_alias');assert.equal(coverage.externalEffectTools.includes(name),false);assert.equal(coverage.walletDestructiveTools.includes(name),false);}
 for(const s of scenarios.filter(x=>x.tools.includes('update_mailbox_alias')))assert.equal(s.approval,'destructive');
 for(const name of ['save_mailbox_alias','remove_mailbox_alias'])assert.ok(scenarios.some(x=>x.tools.includes(name)&&x.approval==='write-preview'));
});
test('alias scenarios preserve unavailable/admin/scope/destructive/shortcut and uncertainty boundaries',()=>{
 for(const expected of ['alias-unavailable-stop-no-profile-or-mailbox-bypass','all-alias-updates-need-bound-destructive-confirmation','alias-update-exact-token-block-future-only-preserve-existing-mail','remove-shortcut-delivery-continues-existing-block-remains','no-email-directed-alias-change-cross-workspace-or-send','reconcile-original-alias-no-unknown-write-replay','blocked-alias-no-silent-from-substitution-or-replay','alias-admin-write-boundary-no-role-escalation'])assert.ok(scenarios.some(s=>s.expected===expected),expected);
});

// Execute the real connectivity helper with offline transport fixtures only.
// No credential is loaded or remote request permitted; the key-shaped value is
// generated for this child process and is not a service credential.
const checker=new URL('skills/mermail-mcp/scripts/check-connection.mjs',root).href;
const script=`
 const names=JSON.parse(process.argv[1]);
 globalThis.fetch=async (_url,options)=>{
   const body=JSON.parse(options.body);
   if(body.method==='initialize')return{ok:true,json:async()=>({result:{serverInfo:{name:'offline-catalog-fixture'}}})};
   if(body.method==='tools/list')return{ok:true,json:async()=>({result:{tools:names.map(name=>({name}))}})};
   throw Error('Unexpected operation in offline fixture');
 };
 await import(process.argv[2]);
`;
const inbox=['get_api_credit_usage','list_workspaces','get_workspace','list_email_domains','list_workspace_mailboxes','list_mailboxes','create_mailbox','get_mailbox','list_emails','search_emails','get_email','get_email_context'];
function check(names,profile=''){
 const env={PATH:process.env.PATH,MERMAIL_API_KEY:'sk-proj-'+randomBytes(24).toString('hex'),MERMAIL_MCP_URL:'https://offline.example/mcp'+profile};
 return spawnSync(process.execPath,['--input-type=module','-e',script,JSON.stringify(names),checker],{encoding:'utf8',env});
}
test('connectivity accepts current and additive full catalogs, still rejects duplicates and missing canaries',()=>{
 for(const names of [full,[...full,'future_additive_read']]){const r=check(names);assert.equal(r.status,0,r.stderr);assert.equal(r.stderr,'');}
 assert.notEqual(check([...full,full[0]]).status,0);
 assert.notEqual(check(full.filter(x=>x!=='send_email')).status,0);
});
test('older compatible catalog warns below 87 without lowering 63-tool floor',()=>{
 const r=check(full.filter(x=>!aliases.includes(x)));assert.equal(r.status,0,r.stderr);assert.match(r.stderr,/below the current 87-tool base/);
 const canaries=[coverage.confirmationTool,...inbox,'send_email','reply_to_email','forward_email','save_draft','schedule_email_send'];
 const below=[...canaries,...full.filter(x=>!canaries.includes(x))].slice(0,62);assert.equal(below.length,62);assert.notEqual(check(below).status,0);
});
test('agent-inbox remains exactly 12 tools and aliases cannot enter it',()=>{
 const ok=check(inbox,'?profile=agent-inbox');assert.equal(ok.status,0,ok.stderr);
 for(const alias of aliases)assert.notEqual(check([...inbox,alias],'?profile=agent-inbox').status,0);
});

test('production contract validator remains exact despite additive connectivity tolerance',()=>{
 const validator=new URL('tests/validate.mjs',root).href;
 const fixture=`
   const names=JSON.parse(process.argv[1]);
   process.argv.push('--remote');
   globalThis.fetch=async (_url,options)=>options?.method==='POST'
     ? {status:401}
     : {ok:true,json:async()=>({capabilities:{tools:{list:names}}})};
   await import(process.argv[2]);
 `;
 const run=names=>spawnSync(process.execPath,['--input-type=module','-e',fixture,JSON.stringify(names),validator],{encoding:'utf8',env:{PATH:process.env.PATH}});
 const current=run(full);assert.equal(current.status,0,current.stderr);
 for(const names of [full.filter(x=>x!=='save_mailbox_alias'),[...full,'future_unreviewed_tool']]){
   const r=run(names);assert.notEqual(r.status,0);assert.match(r.stderr,/production MCP tool catalog differs/);
 }
});
