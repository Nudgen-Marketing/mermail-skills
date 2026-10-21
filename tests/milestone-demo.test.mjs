import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,cpSync,existsSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const source=fileURLToPath(new URL('../skills/mermail-milestone-desk',import.meta.url));
test('actual demo runs local helpers with explicit synthetic boundaries and no provider success claim',()=>{
  const directory=mkdtempSync(path.join(tmpdir(),'milestone-demo-test-'));
  try{
    const run=spawnSync(process.execPath,[path.join(source,'demo.mjs')],{cwd:directory,encoding:'utf8'});
    assert.equal(run.status,0,run.stderr);assert.match(run.stdout,/OFFLINE SIMULATED WALKTHROUGH/);assert.match(run.stdout,/No transfer submitted or settled/);assert.match(run.stdout,/synthetic_fixture_not_provider/);assert.match(run.stdout,/'?"simulated": true/);assert.doesNotMatch(run.stdout,/Transfer submitted|Status confirmed SETTLED|\/paybox\/request\?id=/);
    assert.equal(existsSync(path.join(source,'demo-ledger.json')),false);
  }finally{rmSync(directory,{recursive:true,force:true});}
});
test('shell-looking installation path stays inert and helpers receive literal arguments',()=>{
  const directory=mkdtempSync(path.join(tmpdir(),'milestone-path-test-'));
  try{
    const copied=path.join(directory,'demo $(touch SHELL_PROBE)');cpSync(source,copied,{recursive:true});
    const run=spawnSync(process.execPath,[path.join(copied,'demo.mjs')],{cwd:directory,encoding:'utf8'});
    assert.equal(run.status,0,run.stderr);assert.match(run.stdout,/OFFLINE DEMO COMPLETE/);assert.equal(existsSync(path.join(directory,'SHELL_PROBE')),false);assert.equal(existsSync(path.join(copied,'demo-ledger.json')),false);
    assert.ok(readFileSync(path.join(copied,'scripts','milestone.mjs'),'utf8').length>0);
  }finally{rmSync(directory,{recursive:true,force:true});}
});
