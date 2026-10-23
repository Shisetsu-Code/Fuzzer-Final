import fs from 'node:fs/promises';
const vars=Object.fromEntries((await fs.readFile('.dev.vars','utf8')).trim().split(/\r?\n/).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1)];}));
const base='https://fuzzer-final.braian-n-l.workers.dev';
const rpc=async(name,args)=>{
 const r=await fetch(base+'/mcp',{method:'POST',headers:{authorization:'Bearer '+vars.ACCESS_TOKEN,'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:crypto.randomUUID(),method:'tools/call',params:{name,arguments:args}})});
 const body=await r.json();if(!r.ok||body.error||body.result?.isError)throw Error(JSON.stringify(body));return body.result;
};
await fs.mkdir('work',{recursive:true});
if(process.argv[2]?.startsWith('start')){
 const bonusOnly=process.argv[2]==='start-bonus';
 const result=await rpc('run_games',{games:[{id:'gates-of-olympus',url:'https://demogamesfree.pragmaticplay.net/gs2c/openGame.do?gameSymbol=vs20olympgate&websiteUrl=https%3A%2F%2Fdemogamesfree.pragmaticplay.net&jurisdiction=99&lang=en&cur=USD'}],speed:bonusOnly?8:4,normalSpins:bonusOnly?0:1,anteSpins:bonusOnly?0:1,buyAll:true});
 const job=JSON.parse(result.content[0].text);await fs.writeFile('work/cloud-job.json',JSON.stringify(job));console.log(JSON.stringify(job));
}else{
 const {id}=JSON.parse(await fs.readFile('work/cloud-job.json','utf8'));
 if(process.argv[2]==='stop'){await rpc('act',{jobId:id,kind:'stop',commandId:crypto.randomUUID()});console.log('Stop requested');process.exit(0);}
 const result=await rpc(process.argv[2]==='observe'?'observe':'status',{jobId:id});
 const j=JSON.parse(result.content[0].text);console.log(JSON.stringify({id,status:j.status,heartbeatAgeMs:j.heartbeatAgeMs,state:j.observation?.state,phase:j.observation?.phase,reason:j.observation?.reason,progress:j.observation?.progress,result:j.result,error:j.error}));
 await fs.writeFile('work/cloud-status.json',JSON.stringify(j,null,2));
 for(const item of result.content)if(item.type==='image')await fs.writeFile('work/cloud-screen.jpg',Buffer.from(item.data,'base64'));
}
