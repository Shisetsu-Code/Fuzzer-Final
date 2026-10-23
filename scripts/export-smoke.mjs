import fs from 'node:fs/promises';
const vars=Object.fromEntries((await fs.readFile('.dev.vars','utf8')).trim().split(/\r?\n/).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1)];}));
const {id}=JSON.parse(await fs.readFile('work/cloud-job.json','utf8'));
const call=async(name,args)=>{const r=await fetch('https://fuzzer-final.braian-n-l.workers.dev/mcp',{method:'POST',headers:{authorization:'Bearer '+vars.ACCESS_TOKEN,'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})});const body=await r.json();if(!r.ok||body.result?.isError)throw Error('MCP export failed');return JSON.parse(body.result.content[0].text);};
const data=await call('export_game',{jobId:id,gameId:'gates-of-olympus'});
await fs.writeFile('work/cloud-export.json',JSON.stringify(data,null,2));
let payloads=0,wsFrames=0;
for(const a of data.actions){let trace=await call('get_trace',{jobId:id,actionId:a.id});if(trace.downloadPath){const r=await fetch('https://fuzzer-final.braian-n-l.workers.dev'+trace.downloadPath,{headers:{authorization:'Bearer '+vars.ACCESS_TOKEN}});if(!r.ok)throw Error('private trace download failed');trace=await r.json();}if(trace.events){payloads+=trace.events.filter(e=>e.request?.body||e.response?.body).length;wsFrames+=trace.events.filter(e=>e.transport==='ws'&&e.payload).length;}}
console.log(JSON.stringify({jobId:id,actions:data.actions.length,controls:data.coordinates.length,endpoints:data.endpoints.length,httpPayloadEvents:payloads,wsFrames,categories:[...new Set(data.actions.map(a=>a.category))],networkActions:data.actions.filter(a=>a.networkActionObserved).length}));
