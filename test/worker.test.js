import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';

test('MCP jobs survive requests; one owner and stale observations cannot issue clicks',async()=>{
 const bundle=await build({entryPoints:['src/worker.js'],bundle:true,format:'esm',write:false});
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-10-23',d1Databases:['DB'],r2Buckets:['EVIDENCE'],bindings:{ACCESS_TOKEN:'client',RUNNER_TOKEN:'runner'}}));
 try{
  const db=await mf.getD1Database('DB');
  const sql=await fs.readFile('migrations/0001.sql','utf8');
  for(const statement of sql.split(';').filter(x=>x.trim()))await db.prepare(statement).run();
  const req=async(path,body,token='client')=>{const r=await mf.dispatchFetch('https://worker.test'+path,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
  assert.equal((await req('/mcp',{id:1,method:'tools/list'},'wrong')).status,401);
  const init=await req('/mcp',{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25'}});
  assert.equal(init.body.result.serverInfo.name,'fuzzer-final');
  const start=await req('/mcp',{jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'run_games',arguments:{games:[{id:'olympus',url:'https://www.pragmaticplay.com/en/games/gates-of-olympus/'}]}}});
  const job=JSON.parse(start.body.result.content[0].text);assert.ok(job.id);
  const claim=await req('/runner/claim',{runnerId:'r1'},'runner');assert.equal(claim.body.job.id,job.id);
  assert.equal((await req('/runner/claim',{runnerId:'r2'},'runner')).body.job,null);
  assert.equal((await req('/runner/heartbeat',{jobId:job.id,runnerId:'r2'},'runner')).status,409);
  const observation={id:'obs1',gameId:'olympus',status:'needs_input',controls:[],imageKey:'image.jpg'};
  assert.equal((await req('/runner/heartbeat',{jobId:job.id,runnerId:'r1',observation},'runner')).status,200);
  const call=async(args)=>req('/mcp',{jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'act',arguments:{jobId:job.id,...args}}});
  const click={kind:'click',commandId:'click1',observationId:'obs1',x:.2,y:.3,category:'buy'};
  assert.equal((await call({...click,observationId:'stale'})).body.result.isError,true);
  assert.ok(JSON.parse((await call(click)).body.result.content[0].text).accepted);
  assert.equal(JSON.parse((await call(click)).body.result.content[0].text).duplicate,true);
  const c=await req('/runner/command',{jobId:job.id,runnerId:'r1'},'runner');assert.equal(c.body.command.commandId,'click1');
  assert.equal((await req('/runner/command',{jobId:job.id,runnerId:'r1'},'runner')).body.command,null);
 }finally{await mf.dispose();}
});
