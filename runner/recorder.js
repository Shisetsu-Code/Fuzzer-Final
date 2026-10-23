import {endpointKey,redact} from '../shared/contracts.js';
export function encodePayload(value,limit=2_000_000){
 const binary=Buffer.isBuffer(value),buffer=binary?value:Buffer.from(String(value));
 return {encoding:binary?'base64':'utf8',data:binary?buffer.subarray(0,limit).toString('base64'):buffer.subarray(0,limit).toString('utf8'),bytes:buffer.length,truncated:buffer.length>limit};
}
export function summarizeTrace(trace){
 const map=new Map();for(const e of trace.events){if(e.stage==='response')continue;const method=e.transport==='ws'?e.direction:e.method;if(!e.url||!method)continue;const endpoint=endpointKey(e.url),key=[e.transport,method,endpoint].join('|');const prior=map.get(key);if(prior)prior.count++;else map.set(key,{transport:e.transport,method,endpoint,count:1});}return [...map.values()];
}
const bounded=(promise,ms)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('body-read-timeout')),ms);promise.then(v=>{clearTimeout(timer);resolve(v);},e=>{clearTimeout(timer);reject(e);});});
export class Recorder{
 constructor(page,{maxBytes=20_000_000,maxEvents=5000}={}){
  this.events=[];this.pending=new Set();this.bytes=0;this.dropped=0;this.maxBytes=maxBytes;this.maxEvents=maxEvents;this.actionId='load';this.requestActions=new WeakMap();
  page.on('request',r=>{this.requestActions.set(r,this.actionId);if(['xhr','fetch','document','other','eventsource'].includes(r.resourceType()))this.add({transport:'http',stage:'request',actionId:this.actionId,at:Date.now(),method:r.method(),url:r.url(),request:{headers:redact(r.headers()),body:r.postDataBuffer()?encodePayload(r.postDataBuffer()):null}});});
  page.on('response',response=>{const task=this.http(response).catch(e=>this.add({transport:'error',message:e.message,actionId:this.actionId}));this.pending.add(task);task.finally(()=>this.pending.delete(task));});
  page.on('requestfailed',r=>this.add({transport:'http',actionId:this.requestActions.get(r)||this.actionId,at:Date.now(),method:r.method(),url:r.url(),error:r.failure()?.errorText}));
  page.on('websocket',ws=>{
   this.add({transport:'ws',direction:'open',at:Date.now(),url:ws.url(),actionId:this.actionId});
   for(const [event,direction] of [['framesent','sent'],['framereceived','received']])ws.on(event,f=>this.add({transport:'ws',direction,at:Date.now(),url:ws.url(),payload:encodePayload(f.payload),actionId:this.actionId}));
   ws.on('close',()=>this.add({transport:'ws',direction:'close',at:Date.now(),url:ws.url(),actionId:this.actionId}));
  });
 }
 add(e){const size=Buffer.byteLength(JSON.stringify(e));if(this.events.length>=this.maxEvents||this.bytes+size>this.maxBytes){this.dropped++;return;}this.bytes+=size;this.events.push(e);}
 async http(response){
  const r=response.request(),type=r.resourceType();
  if(!['xhr','fetch','document','other','eventsource'].includes(type))return;
  const actionId=this.requestActions.get(r)||'load';
  const headers=redact(await r.allHeaders()),responseHeaders=redact(await response.allHeaders());
  let payload;
  const length=Number(response.headers()['content-length']||0);
  if(length>2_000_000)payload={omitted:true,bytes:length,reason:'body-size-limit'};
  else {try{payload=encodePayload(await bounded(response.body(),5000));const ct=response.headers()['content-type']||'';if(/json|text|javascript|xml|x-www-form-urlencoded/.test(ct)){const text=Buffer.from(payload.data,'base64').toString('utf8');payload={...payload,encoding:'utf8',data:text};}}catch(e){payload={unavailable:true,reason:e.message.slice(0,160)};}}
  this.add({transport:'http',stage:'response',at:Date.now(),actionId,url:r.url(),method:r.method(),request:{headers,body:r.postDataBuffer()?encodePayload(r.postDataBuffer()):null},response:{status:response.status(),headers:responseHeaders,body:payload}});
 }
 hasBet(actionId){return this.events.some(e=>{if(e.actionId!==actionId)return false;const p=e.transport==='ws'?e.payload:e.request?.body;const body=p?(p.encoding==='base64'?Buffer.from(p.data,'base64').toString():p.data):'';return /\b(?:doSpin|doBonus|placeBet|gameSpin|spin_request|wager)\b/i.test((e.url||'')+' '+body);});}
 async snapshot(actionId){await bounded(Promise.allSettled([...this.pending]),6000).catch(()=>{});const events=this.events.filter(e=>e.actionId===actionId),incomplete=events.some(e=>[e.payload,e.request?.body,e.response?.body].some(p=>p&&(p.truncated||p.unavailable||p.omitted)));return {version:1,actionId,events,dropped:this.dropped,pendingBodies:this.pending.size,complete:this.dropped===0&&!incomplete&&this.pending.size===0};}
 drain(){this.events=[];this.bytes=0;this.dropped=0;}
}
