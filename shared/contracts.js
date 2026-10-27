import registry from './demo-providers.json' with {type:'json'};
export const DEMO_HOSTS=[...new Set(Object.values(registry.providers).flat())];
export function demoUrl(value,hosts=DEMO_HOSTS){
 const u=new URL(value);
 if(u.protocol!=='https:'||u.username||u.password||!hosts.includes(u.host))throw Error('unapproved public DEMO URL');
 if(u.hostname==='www.pragmaticplay.com'&&!/^\/en\/games\/[a-z0-9-]+\/$/.test(u.pathname))throw Error('expected demo detail page');
 if(u.hostname==='www.pragmaticplay.fun'&&!/^\/en\/slots\/[a-z0-9-]+\/$/.test(u.pathname))throw Error('expected demo page');
 return u.href;
}
export function validateJob(j,hosts=DEMO_HOSTS){
 if(!j||!Array.isArray(j.games)||!j.games.length||j.games.length>20)throw Error('games must contain 1..20 demos');
 const games=j.games.map(g=>{
  if(!g||!/^[-a-zA-Z0-9_]{1,80}$/.test(g.id))throw Error('invalid game id');
  return {id:g.id,url:demoUrl(g.url,hosts)};
 });
 if(new Set(games.map(g=>g.id)).size!==games.length)throw Error('duplicate game id');
 const speed=j.speed??4,normalSpins=j.normalSpins??1,anteSpins=j.anteSpins??1;
 if(![1,2,4,8].includes(speed))throw Error('speed must be 1,2,4,8');
 for(const n of [normalSpins,anteSpins])if(!Number.isInteger(n)||n<0||n>10)throw Error('spin count must be 0..10');
 const budgets={};for(const k of ['maxGameMinutes','maxSteps','inputTimeoutMinutes','stallSeconds'])if(j[k]!==undefined){if(!Number.isSafeInteger(j[k])||j[k]<1)throw Error(k+' must be a positive integer');budgets[k]=j[k];}
 return {games,speed,normalSpins,anteSpins,buyAll:j.buyAll!==false,...budgets};
}
export function validateAction(a){
 if(!a||!['click','resume','stop','finish_game'].includes(a.kind))throw Error('invalid action');
 if(!/^[\w-]{1,100}$/.test(a.commandId||''))throw Error('commandId required');
 if(a.kind==='click'){
  if(!/^[\w-]{1,100}$/.test(a.observationId||''))throw Error('observationId required');
  if(![a.x,a.y].every(n=>Number.isFinite(n)&&n>=0&&n<=1))throw Error('normalized x/y required');
  if(!['spin','ante','buy','confirm','continue','choice','other'].includes(a.category))throw Error('category required');
 }
 if(a.kind==='finish_game'&&(!a.summary||typeof a.summary!=='string'||a.summary.length>2000))throw Error('finish_game requires reviewed coverage summary');
 return {kind:a.kind,commandId:a.commandId,...(a.kind==='click'?{observationId:a.observationId,x:a.x,y:a.y,label:String(a.label||a.category).slice(0,160),category:a.category}: {}),...(a.kind==='finish_game'?{summary:a.summary}:{})};
}
const sensitive=/^(?:authorization|cookie|set-cookie|password|passwd|access_token|refresh_token|token|api[-_]?key|secret)$/i;
export function redact(v){
 if(Array.isArray(v))return v.map(redact);
 if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,sensitive.test(k)?'[REDACTED]':redact(x)]));
 return v;
}
export function endpointKey(url){const u=new URL(url);return u.origin+u.pathname;}
export const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
