// Operator-side preparation: do startup/waiting before spending a chat turn.
import fs from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const file=process.argv[2];if(!file)throw Error('Usage: node scripts/prewarm.mjs manifest.json');
const input=JSON.parse(await fs.readFile(file,'utf8'));
const vars=Object.fromEntries((await fs.readFile('.dev.vars','utf8')).trim().split(/\r?\n/).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1)];}));
const url=(process.env.FUZZER_URL||'https://fuzzer-final.braian-n-l.workers.dev').replace(/\/$/,'');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function call(name,args={}){
 const response=await fetch(url+'/mcp',{method:'POST',headers:{authorization:'Bearer '+vars.ACCESS_TOKEN,'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:crypto.randomUUID(),method:'tools/call',params:{name,arguments:args}}),signal:AbortSignal.timeout(20000)});
 const body=await response.json();if(!response.ok||body.result?.isError||body.error)throw Error(body.result?.content?.[0]?.text||body.error?.message||'MCP request failed');return JSON.parse(body.result.content[0].text);
}
let service=await call('service_status');
if(!service.ready){
 const result=spawnSync('gh',['workflow','run','runner.yml','--repo','Shisetsu-Code/Fuzzer-Final'],{encoding:'utf8'});
 if(result.status)throw Error('Cannot start Actions runner: '+result.stderr);
 console.log('Runner requested; waiting for the browser to be online before preparing games.');
 while(!service.ready){await pause(2000);service=await call('service_status');}
}
console.log('Browser online. Preparing indicated demos.');
const batch=await call('prepare_games',input);let previous='';
for(;;){
 service=await call('service_status');
 const jobs=await Promise.all(batch.jobs.map(async j=>{const current=await call('status',{jobId:j.id});return {id:j.id,gameId:j.gameId,status:current.status,reason:current.observation?.reason};}));
 const signature=JSON.stringify(jobs);if(signature!==previous){console.log(signature);previous=signature;}
 const readyIds=new Set(service.sessions.filter(s=>s.status==='ready').map(s=>s.id));
 const ready=jobs.filter(j=>readyIds.has(j.id));
 if(service.ready&&ready.length){
  const result={ready,allJobs:jobs,next:'Give a ready jobId to GPT. Use act kind=resume; do not reopen or create a new job.'};
  await fs.mkdir('work',{recursive:true});await fs.writeFile('work/prepared-jobs.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));break;
 }
 if(jobs.every(j=>['needs_input','error','interrupted','completed'].includes(j.status)))throw Error('No demo ready; inspect the reported preparation blockers before calling a chat.');
 await pause(2000);
}
