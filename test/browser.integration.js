import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {WebSocketServer} from 'ws';
import {chromium} from 'playwright';
import {Recorder} from '../runner/recorder.js';
import {inspect} from '../runner/adapter.js';
import {speedInit} from '../runner/speed.js';
import {GameSession} from '../runner/session.js';
import {foregroundArgs,keepPageActive} from '../runner/foreground.js';

test('four games retain focus, visibility and advancing frames while another page is foregrounded',async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}),args:foregroundArgs});
 try{
  const pages=[];
  const fixture=`<script>window.ticks=0;window.timers=0;setInterval(()=>{if(document.hasFocus()&&!document.hidden)timers++;},50);function step(){if(document.hasFocus()&&!document.hidden)ticks++;requestAnimationFrame(step);}requestAnimationFrame(step);</script>`;
  for(let i=0;i<4;i++){
   const context=await browser.newContext();const page=await context.newPage();
   await keepPageActive(context,page);
   await page.setContent(fixture+'<iframe></iframe>');
   await page.frames()[1].setContent(fixture);
   pages.push(page);
  }
  for(const foreground of pages){
   await foreground.bringToFront();
   const before=await Promise.all(pages.flatMap(p=>p.frames()).map(f=>f.evaluate(()=>({ticks,timers}))));
   await new Promise(resolve=>setTimeout(resolve,400));
   const frames=pages.flatMap(p=>p.frames());
   for(let i=0;i<frames.length;i++){
    const now=await frames[i].evaluate(()=>({focus:document.hasFocus(),visible:document.visibilityState,ticks,timers}));
    assert.equal(now.focus,true);assert.equal(now.visible,'visible');
    assert.ok(now.ticks>before[i].ticks,'background animation must advance');
    assert.ok(now.timers>before[i].timers,'background game timer must advance');
   }
  }
  await pages[0].reload();
  assert.equal(await pages[0].evaluate(()=>document.hasFocus()),true);
 }finally{await browser.close();}
});

test('real browser records HTTP bodies and binary WS frames correlated to a coordinate click',async()=>{
 const server=http.createServer(async(req,res)=>{
  if(req.url==='/spin'){let data='';for await(const c of req)data+=c;res.setHeader('content-type','application/json');res.end(JSON.stringify({received:JSON.parse(data),win:12}));return;}
  res.setHeader('content-type','text/html');res.end(`<button id="spin" style="position:absolute;left:100px;top:100px;width:100px;height:80px">Spin</button><script>const ws=new WebSocket('ws://'+location.host+'/socket');document.getElementById('spin').onclick=async()=>{await fetch('/spin',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'doSpin',stake:2})});ws.send(new Uint8Array([0,255,1]));document.body.dataset.done='yes';};</script>`);
 });
 const wss=new WebSocketServer({server});wss.on('connection',ws=>ws.on('message',data=>ws.send(data)));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:720}});await page.addInitScript(speedInit,4);
  const recorder=new Recorder(page);await page.goto('http://127.0.0.1:'+server.address().port);
  await page.waitForFunction(()=>document.querySelector('button')&&document.readyState==='complete');
  const state=await inspect(page),spin=state.controls.find(c=>c.category==='spin');assert.ok(spin);assert.ok(Math.abs(spin.x-.1171875)<.00001);
  recorder.actionId='spin-1';await page.mouse.click(spin.x*1280,spin.y*720);
  await page.waitForFunction(()=>document.body.dataset.done==='yes');await page.waitForTimeout(150);
  const trace=await recorder.snapshot('spin-1');
  const event=trace.events.find(e=>e.transport==='http'&&e.method==='POST'&&e.stage==='response');assert.ok(event);
  assert.equal(JSON.parse(Buffer.from(event.request.body.data,'base64').toString()).action,'doSpin');
  assert.equal(JSON.parse(event.response.body.data).win,12);
  assert.equal(trace.events.find(e=>e.transport==='ws'&&e.direction==='sent').payload.data,'AP8B');
  assert.equal(trace.complete,true);
 }finally{await browser.close();for(const ws of wss.clients)ws.terminate();await new Promise(r=>wss.close(r));await new Promise(r=>server.close(r));}
});

test('real browser preloads intro without a wager, then starts in the same page',async()=>{
 let loads=0,spins=0;
 const server=http.createServer(async(req,res)=>{
  if(req.url==='/spin'){spins++;for await(const c of req)void c;res.setHeader('content-type','application/json');res.end('{"win":0}');return;}
  if(req.url==='/favicon.ico'){res.writeHead(204).end();return;}
  loads++;res.setHeader('content-type','text/html');res.end(`<body data-state="INTRO" data-phase="unknown"><button id="intro">Continue</button><button id="spin" hidden>Spin</button><script>intro.onclick=()=>{intro.hidden=true;spin.hidden=false;document.body.dataset.state='BASE';document.body.dataset.phase='idle';};spin.onclick=async()=>{document.body.dataset.phase='spinning';await fetch('/spin',{method:'POST',body:'action=doSpin'});document.body.dataset.phase='idle';};</script>`);
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser,session;
 try{
  browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
  let activate=false,sent=false;const records=[],uploads=new Map();
  const cloud={async post(path,body){if(path==='/runner/command'){if(activate&&!sent){sent=true;return {command:{kind:'resume',commandId:'activate'}};}return {command:null};}if(path==='/runner/action')records.push(body.action);return {ok:true};},async upload(job,owner,key,bytes){uploads.set(key,bytes);}};
  const inspectGame=async page=>{const s=await inspect(page),phase=await page.locator('body').evaluate(b=>({state:b.dataset.state,phase:b.dataset.phase}));return {...s,...phase};};
  session=new GameSession({browser,cloud,runnerId:'test',job:{id:'prepared-test',spec:{prepareOnly:true,speed:4,normalSpins:1,anteSpins:0,buyAll:false}},game:{id:'fixture',url:'http://127.0.0.1:'+server.address().port},inspectGame});
  assert.equal((await session.prepare()).ready,true);assert.equal(spins,0);assert.equal(loads,1);
  assert.equal(session.lastObservation.status,'ready');assert.ok(uploads.has(session.lastObservation.imageKey));
  const loadedPage=session.page;
  activate=true;assert.equal(await session.waitPrepared(),'start');
  assert.equal((await session.run()).normalSpins,1);
  assert.equal(session.page,loadedPage);assert.equal(loads,1);assert.equal(spins,1);
  assert.equal(records.filter(r=>r.category==='spin').length,1);
 }finally{await session?.close();await browser?.close();await new Promise(r=>server.close(r));}
});
