import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {chromium} from 'playwright';
import {Recorder} from '../../runner/recorder.js';
import {limitFrames} from './fps.mjs';import {isSpinRequest,values} from './protocol.mjs';
const root=path.resolve('capacity-results');await fs.mkdir(root,{recursive:true});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const save=(name,value)=>fs.writeFile(path.join(root,name),JSON.stringify(value,null,2));
const specs=[
 {name:'Circuit Shock',provider:'playtech',url:'https://cachedownload.playtechone.com/ngmdesktop/casinoclient.html?game=gpas_cish_pop&preferedmode=offline&real=0',intro:[.915,.487],spin:[.915,.49]},
 {name:'Aloha King Elvis',provider:'bgaming',url:'https://demo.bgaming-network.com/play/AlohaKingElvis/FUN?server=demo',intro:[.5,.88],spin:[.883,.945]},
 {name:'Wild Tiger 2',provider:'bgaming',url:'https://demo.bgaming-network.com/play/WildTiger2/FUN?server=demo',intro:[.495,.895],spin:[.883,.945]},
 {name:'3 Lucky Monkeys',provider:'bgaming',url:'https://demo.bgaming-network.com/play/ThreeLuckyMonkeysHoldAndWin/FUN?server=demo',intro:[.5,.94],spin:[.883,.945]}
];
const report={hardware:{cpus:os.cpus().length,cpu:os.cpus()[0]?.model,ramBytes:os.totalmem()},scope:'Bounded CI browser/Recorder benchmark, not the unpublished local MCP transport. Public fictitious-credit demos only. No model API. Two spins twenty seconds apart per stage; not an endurance/bonus test.',frameCapScope:'window.requestAnimationFrame callbacks only; clocks and timers remain native. CSS or worker animations may not follow this cap.',privacy:'Only screenshots, numeric protocol summaries and resource metrics are exported. Raw payloads/session URLs/headers remain ephemeral in runner memory.',profiles:[]};
let cursor=0;
class Session{
 constructor(context,page,spec,slot){this.context=context;this.page=page;this.spec=spec;this.slot=slot;this.recorder=new Recorder(page,{maxBytes:80000000,maxEvents:15000});this.lastBalance=null;}
 async capture(label){const file=`${this.profile}-${this.slot}-${label}.jpg`;await this.page.screenshot({path:path.join(root,file),type:'jpeg',quality:70,timeout:12000});return file;}
 async open(){
  let pending=0,lastActivity=Date.now();
  this.page.on('request',()=>{pending++;lastActivity=Date.now();});
  for(const event of ['requestfinished','requestfailed'])this.page.on(event,()=>{pending=Math.max(0,pending-1);lastActivity=Date.now();});
  await this.page.goto(this.spec.url,{waitUntil:'domcontentloaded',timeout:30000});
  const deadline=Date.now()+45000,start=Date.now();
  while(Date.now()<deadline){if(Date.now()-start>25000&&pending<2&&Date.now()-lastActivity>1800)break;await sleep(500);}
  await this.capture('intro');await this.page.mouse.click(this.spec.intro[0]*1280,this.spec.intro[1]*720);
  await sleep(2000);await this.capture('base');
 }
 async spin(turn){
  const id=`spin-${turn}-${this.slot}`,start=Date.now();this.recorder.actionId=id;
  await this.page.mouse.click(this.spec.spin[0]*1280,this.spec.spin[1]*720);
  const deadline=Date.now()+12000;let acknowledgement=null;
  while(Date.now()<deadline){
   const request=this.recorder.events.find(e=>e.actionId===id&&isSpinRequest(e));
   if(request){acknowledgement=request.at-start;break;}await sleep(100);
  }
  if(acknowledgement===null)return {ok:false,reason:'no_spin_request_observed',ackMs:null};
  await sleep(Math.max(0,20000-(Date.now()-start)));
  const trace=await this.recorder.snapshot(id),money=values(trace.events);
  const consistent=money&&Number.isFinite(money.cost)&&Number.isFinite(money.win)&&Number.isFinite(money.balance)&&(this.lastBalance===null||this.lastBalance-money.cost+money.win===money.balance);
  if(money?.balance!==undefined)this.lastBalance=money.balance;
  const result={ok:!!consistent&&trace.complete,ackMs:acknowledgement,money,traceComplete:trace.complete,events:trace.events.length,dropped:trace.dropped,pendingBodies:trace.pendingBodies};
  this.recorder.drain();return result;
 }
 async close(){await this.context.close();}
}
async function profile(fps){
 cursor=0;
 const result={fps,startedAt:Date.now(),stages:[],loadFailures:[]},sessions=[];report.profiles.push(result);
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||undefined,headless:true,args:['--use-gl=angle','--use-angle=swiftshader-webgl','--enable-unsafe-swiftshader','--mute-audio','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
 try{
  const client=await browser.newBrowserCDPSession();const info=await client.send('SystemInfo.getInfo');result.renderer=info.gpu.auxAttributes?.glRenderer;await client.detach();
  for(const count of [1,2,4,6,8]){
   console.log(JSON.stringify({fps,stage:count,event:'loading'}));
   const stage={sessions:count,startedAt:Date.now(),rounds:[],screenshots:[]};result.stages.push(stage);
   while(sessions.length<count){
    let added=false;
    for(let attempt=0;attempt<2;attempt++){
     const spec=specs[cursor++%specs.length],context=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1,serviceWorkers:'block'});
     if(fps)await context.addInitScript(limitFrames,fps);
     const page=await context.newPage(),session=new Session(context,page,spec,sessions.length);session.profile='fps'+fps;
     try{await session.open();sessions.push(session);added=true;break;}
     catch(error){result.loadFailures.push({game:spec.name,error:error.name,at:Date.now()});await context.close();}
    }
    if(!added)break;
   }
   if(sessions.length<count){stage.reason='launch_failure_not_capacity_measurement';stage.finishedAt=Date.now();break;}
   stage.steadyStartedAt=Date.now();
   for(let turn=0;turn<2;turn++){
    const rounds=await Promise.all(sessions.map(async session=>{
     try{return {game:session.spec.name,slot:session.slot,...await session.spin(`${count}-${turn}`)};}
     catch(error){return {game:session.spec.name,slot:session.slot,ok:false,error:error.name};}
    }));stage.rounds.push(rounds);
   }
   for(const session of sessions){
    try{stage.screenshots.push(await session.capture(`stage${count}`));}catch(error){stage.screenshots.push({slot:session.slot,error:error.name});}
   }
   stage.capObservations=await Promise.all(sessions.map(s=>s.page.evaluate(()=>globalThis.__capacityFrameCap?{...globalThis.__capacityFrameCap,observedAt:performance.now()}:null).catch(()=>null)));
   stage.finishedAt=Date.now();stage.functional=stage.rounds.every(round=>round.every(spin=>spin.ok));
   console.log(JSON.stringify({fps,sessions:count,event:'measured',functional:stage.functional,okSpins:stage.rounds.flat().filter(x=>x.ok).length,expectedSpins:count*2}));
   await save('summary.json',report);
   // Do not amplify failures. CPU headroom is evaluated from synchronized samples afterwards.
   if(!stage.functional)break;
  }
 }finally{await browser.close();result.finishedAt=Date.now();await save('summary.json',report);}
}
try{for(const fps of (process.env.BENCH_FPS===undefined?[0,30,15]:[Number(process.env.BENCH_FPS)]))await profile(fps);}
finally{report.finishedAt=Date.now();await save('summary.json',report);}
