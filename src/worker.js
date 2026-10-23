import {validateJob,validateAction,json,DEMO_HOSTS} from '../shared/contracts.js';
import {oauth,oauthToken} from './oauth.js';

const fields=(properties,required=[])=>({type:'object',properties,required,additionalProperties:false});
const str={type:'string'},num={type:'number'};
export const tools=[
 {name:'run_games',description:'Start public DEMO games in GitHub Actions. Runs normal/Ante spins and all discovered purchase variants. Unknown canvases pause in the SAME live browser for observe/act. Returns immediately; never wait for an entire suite in one MCP call.',inputSchema:fields({games:{type:'array',items:fields({id:str,url:str},['id','url']),minItems:1,maxItems:20},speed:{type:'integer',enum:[1,2,4,8]},normalSpins:{type:'integer',minimum:0,maximum:10},anteSpins:{type:'integer',minimum:0,maximum:10},buyAll:{type:'boolean'}},['games'])},
 {name:'observe',description:'Read latest screenshot and controls from a live job. On needs_input inspect image and use act. A queued job needs a GitHub runner. Do not repeatedly poll unchanged revisions.',inputSchema:fields({jobId:str},['jobId'])},
 {name:'act',description:'Click a reviewed normalized VIEWPORT coordinate in the current demo screenshot, then observe. commandId is an idempotency key: NEVER change it to retry an uncertain click. observationId must be current. resume restarts auto discovery; stop ends job. finish_game requires summary of coverage manually verified by ChatGPT on an opaque canvas; never claim untested variants.',inputSchema:fields({jobId:str,kind:{type:'string',enum:['click','resume','stop','finish_game']},commandId:str,observationId:str,x:num,y:num,label:str,summary:str,category:{type:'string',enum:['spin','ante','buy','confirm','continue','choice','other']}},['jobId','kind','commandId'])},
 {name:'status',description:'Job liveness and latest results. heartbeatAgeMs detects dead Actions runners; no browser input.',inputSchema:fields({jobId:str},['jobId'])},
 {name:'export_game',description:'Get coordinate map, action sequence and HTTP/WS endpoint index. Each action includes private traceKey; use get_trace for request/response payloads. Cursor pagination.',inputSchema:fields({jobId:str,gameId:str,after:str},['jobId','gameId'])},
 {name:'get_trace',description:'Read private HTTP request/response and WebSocket payload evidence for ONE action. Binary payloads are base64; dropped/truncated flags must be reported. No network replay is performed.',inputSchema:fields({jobId:str,actionId:str},['jobId','actionId'])}
];
async function auth(request,token){
 if(!token)return false;
 const value=request.headers.get('authorization')||'';
 const h=async s=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));
 const [a,b]=await Promise.all([h(value),h('Bearer '+token)]);let d=0;for(let i=0;i<a.length;i++)d|=a[i]^b[i];return d===0;
}
const row=(env,id)=>env.DB.prepare('SELECT * FROM jobs WHERE id=?').bind(id).first();
const parse=v=>v?JSON.parse(v):null;
const textResult=v=>({content:[{type:'text',text:JSON.stringify(v)}]});
function publicJob(j){return j?{id:j.id,status:j.status,created:j.created,heartbeat:j.heartbeat,heartbeatAgeMs:j.heartbeat?Date.now()-j.heartbeat:null,observation:parse(j.observation),result:parse(j.result),error:j.error}:null;}
async function owned(env,b){const j=await row(env,b.jobId);if(!j||j.runner!==b.runnerId||!['running','needs_input'].includes(j.status))throw Object.assign(Error('job ownership lost'),{status:409});return j;}
async function boundedJson(request,max=2_000_000){
 const reader=request.body?.getReader();if(!reader)throw Error('body required');let n=0;const parts=[];
 for(;;){const {done,value}=await reader.read();if(done)break;n+=value.length;if(n>max){await reader.cancel();throw Object.assign(Error('body too large'),{status:413});}parts.push(value);}
 const buffer=new Uint8Array(n);let p=0;for(const v of parts){buffer.set(v,p);p+=v.length;}return JSON.parse(new TextDecoder().decode(buffer));
}
async function callTool(name,args,env){
 if(name==='run_games'){
  const spec=validateJob(args,[...DEMO_HOSTS,...(env.DEMO_HOSTS||'').split(',').filter(Boolean)]);
  const id=crypto.randomUUID();await env.DB.prepare('INSERT INTO jobs(id,spec,created) VALUES(?,?,?)').bind(id,JSON.stringify(spec),Date.now()).run();
  let dispatch='scheduled-runner';
  if(env.GITHUB_DISPATCH_TOKEN){
   try{const r=await fetch('https://api.github.com/repos/'+(env.GITHUB_REPOSITORY||'Shisetsu-Code/Fuzzer-Final')+'/actions/workflows/runner.yml/dispatches',{method:'POST',headers:{authorization:'Bearer '+env.GITHUB_DISPATCH_TOKEN,'content-type':'application/json','user-agent':'fuzzer-final','x-github-api-version':'2022-11-28'},body:JSON.stringify({ref:'main'})});dispatch=r.ok?'dispatched':'dispatch-failed-'+r.status;}catch{dispatch='dispatch-network-error';}
  }
  return textResult({id,status:'queued',dispatch,next:'observe',note:dispatch==='scheduled-runner'?'Runner starts on schedule (up to several minutes), or dispatch runner.yml manually. Optional fine-grained GITHUB_DISPATCH_TOKEN enables immediate startup.':undefined});
 }
 const j=await row(env,args.jobId);if(!j)throw Error('job not found');
 if(name==='status')return textResult(publicJob(j));
 if(name==='observe'){
  const info=publicJob(j);
  info.imageAgeMs=info.observation?.capturedAt?Date.now()-info.observation.capturedAt:null;
  if(j.status==='needs_input'&&info.imageAgeMs>5000){
   const commandId='refresh-'+info.observation.id;
   await env.DB.prepare("INSERT OR IGNORE INTO commands(job_id,id,body,created) SELECT ?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM commands WHERE job_id=? AND status IN ('queued','running'))").bind(j.id,commandId,JSON.stringify({kind:'snapshot',commandId}),Date.now(),j.id).run();info.refreshing=true;info.next='Call observe again for the refreshed image before clicking.';
  }
  const content=[{type:'text',text:JSON.stringify(info)}];
  if(info.observation?.imageKey){const obj=await env.EVIDENCE.get(info.observation.imageKey);if(obj){const bytes=new Uint8Array(await obj.arrayBuffer());let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));content.push({type:'image',mimeType:'image/jpeg',data:btoa(s)});}}
  return {content};
 }
 if(name==='act'){
  const a=validateAction(args);
  const existing=await env.DB.prepare('SELECT body FROM commands WHERE job_id=? AND id=?').bind(j.id,a.commandId).first();
  if(existing){if(existing.body!==JSON.stringify(a))throw Error('commandId reused for different action');return textResult({accepted:true,duplicate:true});}
  if(!['running','needs_input'].includes(j.status)||!j.heartbeat||Date.now()-j.heartbeat>60000)throw Error('runner not live');
  const obs=parse(j.observation);
  if(a.kind==='click'&&(obs?.id!==a.observationId||obs?.status!=='needs_input'||Date.now()-(obs.capturedAt||0)>15000))throw Error('stale observation or game still running; call observe to refresh');
  const result=await env.DB.prepare(`INSERT INTO commands(job_id,id,body,created) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM jobs WHERE id=? AND status IN ('running','needs_input') AND (? IS NULL OR json_extract(observation,'$.id')=?))`).bind(j.id,a.commandId,JSON.stringify(a),Date.now(),j.id,a.kind==='click'?a.observationId:null,a.observationId??null).run();
  if(!result.meta.changes)throw Error('observation changed');return textResult({accepted:true,commandId:a.commandId,next:'observe'});
 }
 if(name==='export_game'){
  const actions=await env.DB.prepare('SELECT id,record FROM actions WHERE job_id=? AND game_id=? AND id>? ORDER BY id LIMIT 50').bind(j.id,args.gameId,args.after||'').all();
  const controls=await env.DB.prepare('SELECT record FROM controls WHERE job_id=? AND game_id=? LIMIT 1000').bind(j.id,args.gameId).all();
  const ids=actions.results.map(x=>x.id),endpoints=[];
  for(const id of ids){const r=await env.DB.prepare('SELECT * FROM endpoints WHERE job_id=? AND action_id=?').bind(j.id,id).all();endpoints.push(...r.results);}
  return textResult({jobId:j.id,gameId:args.gameId,coordinates:controls.results.map(x=>parse(x.record)),actions:actions.results.map(x=>parse(x.record)),endpoints,next:ids.length===50?ids.at(-1):null});
 }
 if(name==='get_trace'){
  const a=await env.DB.prepare('SELECT trace_key FROM actions WHERE job_id=? AND id=?').bind(j.id,args.actionId).first();if(!a)throw Error('action not found');
  const obj=await env.EVIDENCE.get(a.trace_key);if(!obj)throw Error('trace not uploaded');
  const size=obj.size;if(size>1_000_000)return textResult({traceKey:a.trace_key,bytes:size,downloadPath:'/v1/evidence/'+encodeURIComponent(a.trace_key),note:'Large trace: authenticated download avoids flooding model context.'});
  return textResult(parse(await obj.text()));
 }
 throw Error('unknown tool');
}
async function runner(request,env,path){
 const b=await boundedJson(request,5_000_000);
 if(path==='/runner/claim'){
  if(!/^[\w-]{1,100}$/.test(b.runnerId||''))throw Error('invalid runner id');
  const previous=await env.DB.prepare("SELECT * FROM jobs WHERE runner=? AND status IN ('running','needs_input') LIMIT 1").bind(b.runnerId).first();if(previous)return json({job:{...publicJob(previous),spec:parse(previous.spec)}});
  const job=await env.DB.prepare(`UPDATE jobs SET status='running',runner=?,heartbeat=? WHERE id=(SELECT id FROM jobs WHERE status='queued' ORDER BY created LIMIT 1) AND status='queued' RETURNING *`).bind(b.runnerId,Date.now()).first();
  return json({job:job?{...publicJob(job),spec:parse(job.spec)}:null});
 }
 const j=await owned(env,b);
 if(path==='/runner/heartbeat'){
  const obs=b.observation?JSON.stringify(b.observation):null;
  await env.DB.prepare('UPDATE jobs SET heartbeat=?,observation=COALESCE(?,observation),status=CASE WHEN ? IS NULL THEN status ELSE ? END WHERE id=? AND runner=?').bind(Date.now(),obs,obs,b.observation?.status==='needs_input'?'needs_input':'running',j.id,b.runnerId).run();
  return json({ok:true});
 }
 if(path==='/runner/command'){
  const cmd=await env.DB.prepare(`UPDATE commands SET status='running' WHERE job_id=? AND id=(SELECT id FROM commands WHERE job_id=? AND status='queued' ORDER BY created LIMIT 1) AND status='queued' RETURNING body`).bind(j.id,j.id).first();return json({command:cmd?parse(cmd.body):null});
 }
 if(path==='/runner/ack'){
  await env.DB.prepare(`UPDATE commands SET status=? WHERE job_id=? AND id=? AND status='running'`).bind(b.error?'failed':'done',j.id,b.commandId).run();return json({ok:true});
 }
 if(path==='/runner/action'){
  const a=b.action;if(!a||!/^[\w-]{1,100}$/.test(a.id)||typeof a.gameId!=='string'||!Array.isArray(b.endpoints)||b.endpoints.length>1000)throw Error('invalid action evidence');
  const traceKey=j.id+'/traces/'+a.id+'.json';
  if(!await env.EVIDENCE.head(traceKey))throw Error('trace upload required before action index');
  const statements=[env.DB.prepare('INSERT OR IGNORE INTO actions(job_id,id,game_id,category,label,x,y,observation_id,trace_key,record) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(j.id,a.id,a.gameId,a.category,a.label,a.x??null,a.y??null,a.observationId??null,traceKey,JSON.stringify({...a,traceKey}))];
  for(const e of b.endpoints)statements.push(env.DB.prepare('INSERT OR IGNORE INTO endpoints(job_id,action_id,transport,method,endpoint,count) VALUES(?,?,?,?,?,?)').bind(j.id,a.id,e.transport,e.method,e.endpoint,e.count));
  for(const c of (b.controls||[]).slice(0,250))statements.push(env.DB.prepare('INSERT OR REPLACE INTO controls(job_id,game_id,id,record) VALUES(?,?,?,?)').bind(j.id,a.gameId,c.id,JSON.stringify(c)));
  for(let i=0;i<statements.length;i+=80)await env.DB.batch(statements.slice(i,i+80));
  return json({ok:true});
 }
 if(path==='/runner/finish'){
  await env.DB.prepare('UPDATE jobs SET status=?,result=?,error=?,heartbeat=? WHERE id=? AND runner=?').bind(b.error?'error':'completed',JSON.stringify(b.result||null),b.error?String(b.error).slice(0,1000):null,Date.now(),j.id,b.runnerId).run();return json({ok:true});
 }
 return json({error:'not found'},404);
}
export default {async fetch(request,env){
 const url=new URL(request.url),path=url.pathname;
 try{
  if(path==='/health'){
   await env.DB.prepare('SELECT id FROM jobs LIMIT 1').all();return json({ok:true,service:'fuzzer-final',version:1,storage:!!env.EVIDENCE,runnerConfigured:!!env.RUNNER_TOKEN,immediateDispatch:!!env.GITHUB_DISPATCH_TOKEN});
  }
  if(['/authorize','/register','/token'].includes(path)||path.startsWith('/.well-known/')){const response=await oauth(request,env);if(response)return response;}
  const isRunner=path.startsWith('/runner/');
  if(!await auth(request,isRunner?env.RUNNER_TOKEN:env.ACCESS_TOKEN)&&!( !isRunner&&await oauthToken(request,env))){const r=json({error:'unauthorized'},401);r.headers.set('WWW-Authenticate','Bearer resource_metadata="'+url.origin+'/.well-known/oauth-protected-resource/mcp"');return r;}
  if(path.startsWith('/v1/evidence/')&&request.method==='GET'){
   const key=decodeURIComponent(path.slice('/v1/evidence/'.length));const obj=await env.EVIDENCE.get(key);if(!obj)return json({error:'not found'},404);return new Response(obj.body,{headers:{'content-type':obj.httpMetadata?.contentType||'application/octet-stream','cache-control':'no-store'}});
  }
  if(path==='/runner/evidence'&&request.method==='PUT'){
   const jobId=url.searchParams.get('jobId'),runnerId=url.searchParams.get('runnerId'),key=url.searchParams.get('key');await owned(env,{jobId,runnerId});
   if(!key?.startsWith(jobId+'/')||key.includes('..'))throw Error('invalid evidence key');
   const size=Number(request.headers.get('content-length'));if(!size||size>25_000_000)throw Error('evidence must have bounded Content-Length');
   await env.EVIDENCE.put(key,request.body,{httpMetadata:{contentType:request.headers.get('content-type')||'application/octet-stream'}});return json({ok:true,key});
  }
  if(request.method!=='POST')return json({error:'method not allowed'},405);
  if(isRunner)return await runner(request,env,path);
  if(path!=='/mcp')return json({error:'not found'},404);
  const origin=request.headers.get('origin');if(origin&&!['https://chatgpt.com',url.origin].includes(origin))return json({error:'invalid origin'},403);
  const rpc=await boundedJson(request);
  if(rpc.id===undefined)return new Response(null,{status:202});
  let result;
  if(rpc.method==='initialize')result={protocolVersion:['2025-03-26','2025-06-18','2025-11-25','2026-07-28'].includes(rpc.params?.protocolVersion)?rpc.params.protocolVersion:'2025-11-25',capabilities:{tools:{}},serverInfo:{name:'fuzzer-final',version:'0.1.0'},instructions:'Public DEMO only. run_games returns a durable job. observe returns live screenshots. Known controls proceed automatically; resolve needs_input using act on current observation. Preserve commandId on uncertain results. Export coordinates/traces after completion. A stopped runner cannot continue browser state; report heartbeat age.'};
  else if(rpc.method==='ping')result={};
  else if(rpc.method==='tools/list')result={tools};
  else if(rpc.method==='tools/call'){try{result=await callTool(rpc.params.name,rpc.params.arguments||{},env);}catch(e){result={isError:true,content:[{type:'text',text:e.message}]};}}
  else return json({jsonrpc:'2.0',id:rpc.id,error:{code:-32601,message:'Method not found'}});
  return json({jsonrpc:'2.0',id:rpc.id,result});
 }catch(e){console.error(JSON.stringify({event:'request_error',path,message:e.message}));return json({error:e.message},e.status||400);}
}};
