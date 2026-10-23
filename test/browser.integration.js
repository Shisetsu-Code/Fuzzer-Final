import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {WebSocketServer} from 'ws';
import {chromium} from 'playwright';
import {Recorder} from '../runner/recorder.js';
import {inspect} from '../runner/adapter.js';
import {speedInit} from '../runner/speed.js';

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
