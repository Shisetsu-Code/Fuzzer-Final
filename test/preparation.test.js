import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';

test('preparation is idempotent, reports live readiness and starts the same job on demand',async()=>{
 const bundle=await build({entryPoints:['src/worker.js'],bundle:true,format:'esm',write:false});
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-10-23',d1Databases:['DB'],r2Buckets:['EVIDENCE'],bindings:{ACCESS_TOKEN:'client',RUNNER_TOKEN:'runner'}}));
 try{
  const db=await mf.getD1Database('DB');
  for(const file of (await fs.readdir('migrations')).sort())for(const sql of (await fs.readFile('migrations/'+file,'utf8')).split(';').filter(s=>s.trim()))await db.prepare(sql).run();
  const req=async(path,body,token='runner')=>{const r=await mf.dispatchFetch('https://worker.test'+path,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
  const call=async(name,args={})=>{const r=await req('/mcp',{jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}},'client');assert.equal(r.body.result?.isError,undefined,JSON.stringify(r.body));return JSON.parse(r.body.result.content[0].text);};
  assert.equal((await call('service_status')).ready,false);
  assert.equal((await req('/runner/presence',{runnerId:'service',capacity:2,busy:0,browserReady:true})).status,200);
  assert.equal((await call('service_status')).ready,true);
  const games=[{id:'one',url:'https://demogamesfree.pragmaticplay.net/one'},{id:'two',url:'https://demogamesfree.pragmaticplay.net/two'}];
  const batch=await call('prepare_games',{games});assert.equal(batch.jobs.length,2);
  const again=await call('prepare_games',{games});assert.deepEqual(again.jobs.map(j=>j.id),batch.jobs.map(j=>j.id));
  assert.equal((await req('/runner/claim',{runnerId:'legacy-runner'})).body.job,null);
  const first=(await req('/runner/claim',{runnerId:'service-slot0',supportsPreparation:true})).body.job;
  assert.equal(first.spec.prepareOnly,true);assert.equal(first.status,'preparing');
  const observation={id:'ready-1',gameId:first.spec.games[0].id,status:'ready',state:'BASE',phase:'idle',capturedAt:Date.now(),controls:[{id:'spin',category:'spin'}]};
  assert.equal((await req('/runner/heartbeat',{jobId:first.id,runnerId:'service-slot0',observation})).status,200);
  const ready=await call('service_status');assert.ok(ready.sessions.some(s=>s.id===first.id&&s.status==='ready'));
  const bad=await req('/mcp',{jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'act',arguments:{jobId:first.id,kind:'click',category:'spin',x:.5,y:.5,observationId:'ready-1',commandId:'too-soon'}}},'client');assert.equal(bad.body.result.isError,true);
  const activate=await call('act',{jobId:first.id,kind:'resume',commandId:'activate-ready'});assert.equal(activate.accepted,true);
  const reused=await call('run_games',{games:first.spec.games});assert.equal(reused.id,first.id);assert.equal(reused.reusedPrepared,true);
  const command=(await req('/runner/command',{jobId:first.id,runnerId:'service-slot0'})).body.command;assert.equal(command.kind,'resume');
  assert.equal((await req('/runner/start',{jobId:first.id,runnerId:'service-slot0'})).status,200);
  const started=await db.prepare('SELECT status,operation_started FROM jobs WHERE id=?').bind(first.id).first();assert.equal(started.status,'running');assert.ok(started.operation_started);
  const second=(await req('/runner/claim',{runnerId:'service-slot1',supportsPreparation:true})).body.job;assert.notEqual(second.id,first.id);
  const unknown={...observation,id:'unknown',gameId:second.spec.games[0].id,state:'UNKNOWN'};
  assert.equal((await req('/runner/heartbeat',{jobId:second.id,runnerId:'service-slot1',observation:unknown})).status,400);
  await db.prepare('UPDATE runners SET heartbeat=0').run();assert.equal((await call('service_status')).ready,false);
 }finally{await mf.dispose();}
});
