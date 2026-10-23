import {json} from '../shared/contracts.js';
const base64url=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
export async function pkceChallenge(v){return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v))));}
export function validRedirect(v){try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&['chatgpt.com','chat.openai.com'].includes(u.hostname);}catch{return false;}}
export async function equalSecret(a,b){if(!b)return false;const x=await pkceChallenge(a||''),y=await pkceChallenge(b);let diff=0;for(let i=0;i<x.length;i++)diff|=x.charCodeAt(i)^y.charCodeAt(i);return diff===0;}
export async function oauthToken(request,env){const token=(request.headers.get('authorization')||'').replace(/^Bearer /,'');if(!token)return false;const row=await env.DB.prepare('SELECT expires FROM oauth_tokens WHERE hash=?').bind(await pkceChallenge(token)).first();return !!row&&row.expires>Date.now();}
const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
export async function oauth(request,env){
 const u=new URL(request.url),origin=u.origin,path=u.pathname;
 if(path==='/.well-known/oauth-protected-resource'||path==='/.well-known/oauth-protected-resource/mcp')return json({resource:origin+'/mcp',authorization_servers:[origin],scopes_supported:['fuzzer']});
 if(path==='/.well-known/oauth-authorization-server')return json({issuer:origin,authorization_endpoint:origin+'/authorize',token_endpoint:origin+'/token',registration_endpoint:origin+'/register',response_types_supported:['code'],grant_types_supported:['authorization_code'],code_challenge_methods_supported:['S256'],token_endpoint_auth_methods_supported:['none'],scopes_supported:['fuzzer']});
 if(path==='/register'&&request.method==='POST'){
  if(Number(request.headers.get('content-length'))>20000)return json({error:'invalid_client_metadata'},400);
  const b=await request.json();if(!Array.isArray(b.redirect_uris)||!b.redirect_uris.length||b.redirect_uris.length>5||!b.redirect_uris.every(validRedirect))return json({error:'invalid_redirect_uri'},400);
  const client_id=crypto.randomUUID();await env.DB.prepare('INSERT INTO oauth_clients(id,redirects) VALUES(?,?)').bind(client_id,JSON.stringify(b.redirect_uris)).run();
  return json({client_id,redirect_uris:b.redirect_uris,token_endpoint_auth_method:'none',grant_types:['authorization_code'],response_types:['code']},201);
 }
 if(path==='/authorize'){
  const p=request.method==='POST'?new URLSearchParams(await request.text()):u.searchParams;
  const client=await env.DB.prepare('SELECT redirects FROM oauth_clients WHERE id=?').bind(p.get('client_id')||'').first();
  if(!client||!JSON.parse(client.redirects).includes(p.get('redirect_uri'))||p.get('response_type')!=='code'||p.get('code_challenge_method')!=='S256'||!/^[\w-]{43}$/.test(p.get('code_challenge')||''))return json({error:'invalid_request'},400);
  if(request.method==='POST'){
   if(!await equalSecret(p.get('access_key'),env.ACCESS_TOKEN))return new Response('Access key incorrect',{status:403});
   const code=crypto.randomUUID()+crypto.randomUUID();
   await env.DB.prepare('INSERT INTO oauth_codes(hash,client_id,redirect_uri,challenge,expires) VALUES(?,?,?,?,?)').bind(await pkceChallenge(code),p.get('client_id'),p.get('redirect_uri'),p.get('code_challenge'),Date.now()+120000).run();
   const redirect=new URL(p.get('redirect_uri'));redirect.searchParams.set('code',code);if(p.has('state'))redirect.searchParams.set('state',p.get('state'));return Response.redirect(redirect.href,302);
  }
  const hidden=['client_id','redirect_uri','response_type','code_challenge_method','code_challenge','state'].map(k=>'<input type="hidden" name="'+k+'" value="'+escape(p.get(k)||'')+'">').join('');
  return new Response('<!doctype html><html><meta name="viewport" content="width=device-width"><title>Fuzzer Final</title><body style="font:18px system-ui;max-width:520px;margin:10vh auto;padding:20px"><h1>Conectar Fuzzer Final</h1><p>Autorizar a ChatGPT a controlar demos y leer capturas y trazas privadas.</p><form method="post">'+hidden+'<label>Clave de acceso <input name="access_key" type="password" required autocomplete="off"></label><p><button>Autorizar ChatGPT</button></p></form></body></html>',{headers:{'content-type':'text/html;charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",'referrer-policy':'no-referrer'}});
 }
 if(path==='/token'&&request.method==='POST'){
  const p=new URLSearchParams(await request.text());
  if(p.get('grant_type')!=='authorization_code'||!/^[\w.~\-]{43,128}$/.test(p.get('code_verifier')||''))return json({error:'invalid_grant'},400);
  const hash=await pkceChallenge(p.get('code')||'');
  const row=await env.DB.prepare('DELETE FROM oauth_codes WHERE hash=? AND client_id=? AND redirect_uri=? AND expires>? AND challenge=? RETURNING *').bind(hash,p.get('client_id')||'',p.get('redirect_uri')||'',Date.now(),await pkceChallenge(p.get('code_verifier'))).first();
  if(!row)return json({error:'invalid_grant'},400);
  const token=crypto.randomUUID()+crypto.randomUUID();await env.DB.prepare('INSERT INTO oauth_tokens(hash,expires) VALUES(?,?)').bind(await pkceChallenge(token),Date.now()+86400000).run();
  return json({access_token:token,token_type:'Bearer',expires_in:86400,scope:'fuzzer'});
 }
 return null;
}
