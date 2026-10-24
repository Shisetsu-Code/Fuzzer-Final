import {randomUUID,createHash} from 'node:crypto';
import {inspect,category} from './adapter.js';
import {Recorder,summarizeTrace} from './recorder.js';
import {speedInit} from './speed.js';
import {SuitePlanner} from './planner.js';
import {sleep} from './client.js';
import {ProgressWatchdog} from './progress.js';
import {keepPageActive} from './foreground.js';
const id=()=>randomUUID();
export class GameSession{
 constructor({browser,cloud,job,runnerId,game,inspectGame=inspect,signal,assertHealthy=()=>{}}){Object.assign(this,{browser,cloud,job,runnerId,game,inspectGame,signal,assertHealthy});this.planner=new SuitePlanner(job.spec);this.sequence=0;this.actions=[];this.stopped=false;this.lastObservation=null;this.pendingPurpose=null;this.deadline=!job.spec.prepareOnly&&job.spec.maxGameMinutes?Date.now()+job.spec.maxGameMinutes*60000:Infinity;this.preparationComplete=false;this.operationStarted=false;}
 async post(path,data={}){return this.cloud.post(path,{jobId:this.job.id,runnerId:this.runnerId,...data});}
 async upload(key,bytes,type){await this.cloud.upload(this.job.id,this.runnerId,key,bytes,type);return key;}
 async open(){
  this.context=await this.browser.newContext({viewport:{width:1280,height:720},serviceWorkers:'block'});
  await this.context.addInitScript(speedInit,this.job.spec.speed);
  // Refuse account/checkout redirects while allowing demo asset and game hosts.
  await this.context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(req.isNavigationRequest()&&/login|sign.?in|checkout|cashier|deposit|payment/i.test(url.pathname))return route.abort();
   return route.continue();
  });
  this.page=await this.context.newPage();this.page.setDefaultTimeout(4000);this.page.setDefaultNavigationTimeout(45000);
  this.focusClient=await keepPageActive(this.context,this.page);
  this.recorder=new Recorder(this.page);const loadId=id();this.recorder.actionId=loadId;await this.page.goto(this.game.url,{waitUntil:'domcontentloaded'});
  // The operator explicitly confirms adult status; no account credentials are used.
  await this.dismissPageOverlays();
  const started=Date.now();let s;
  do{s=await this.inspectGame(this.page);if(s.controls.length||Date.now()-started>30000)break;await sleep(500);}while(true);
  await this.saveTrace(loadId,{category:'load',label:'Initial demo load',outcome:'loaded',started});
  return s;
 }
 async dismissPageOverlays(){
  for(const name of [/Yes, I am 18/i,/^Reject All$/i,/^Reject all cookies$/i]){
   const e=this.page.getByRole('link',{name}).or(this.page.getByRole('button',{name}));if(await e.count()===1&&await e.isVisible())await e.click({timeout:1000}).catch(()=>{});
  }
  if(!this.page.frames().some(f=>/demogamesfree\.pragmaticplay\.net/.test(f.url()))){const demo=this.page.getByRole('link',{name:/^play demo$/i}).or(this.page.getByRole('button',{name:/^play demo$/i}));if(await demo.count()===1&&await demo.isVisible())await demo.click({timeout:1000}).catch(()=>{});}
 }
 async prepare(){
  if(!this.page)await this.open();
  if(this.preparationFault){await this.snapshot('needs_input',this.preparationFault);return {ready:false,reason:this.preparationFault};}
  const started=Date.now(),watch=new ProgressWatchdog({stallSeconds:this.job.spec.stallSeconds??45}),introClicks=new Set();let stable=0,lastKey='',lastSnapshot=Date.now();
  await this.snapshot('preparing','loading demo and known intro');
  for(;;){
   await this.checkStop();await this.dismissPageOverlays();const s=await this.inspectGame(this.page);
   const key=JSON.stringify([s.state,s.phase,(s.controls||[]).map(c=>c.id)]);
   watch.update({stage:key,networkRevision:this.recorder.events?.length||0});
   if(this.actions.some(a=>a.networkActionObserved)){this.preparationFault='unexpected game request during preparation';this.preparationComplete=false;await this.snapshot('needs_input',this.preparationFault);return {ready:false,reason:'unexpected-game-request'};}
   if(s.state==='INTRO'){
    const intro=(s.controls||[]).filter(c=>c.category==='continue');
    if(intro.length===1&&!introClicks.has(intro[0].id)){if(await this.dismissIntro(intro[0]))introClicks.add(intro[0].id);stable=0;await sleep(200);continue;}
   }
   const base=s.state==='BASE'&&s.phase==='idle'&&(s.controls||[]).some(c=>['spin','ante','buy'].includes(c.category));
   stable=base&&key===lastKey?stable+1:0;lastKey=key;
   if(base&&stable>=2&&Date.now()-started>=1200){
    this.preparedAt=Date.now();this.preparationComplete=true;
    try{const observation=await this.snapshot('ready','demo prepared at BASE/idle; activate with act resume');return {ready:true,observation};}
    catch(e){this.preparationComplete=false;if(!e.message.includes('game is not ready at BASE/idle'))throw e;stable=0;}
   }
   if(watch.stalled()){this.preparationComplete=false;await this.snapshot('needs_input','preparation needs visual input: '+s.state+'/'+s.phase);return {ready:false,reason:'preparation-needs-vision'};}
   if(Date.now()-lastSnapshot>10000){await this.snapshot('preparing','preparing '+s.state+'/'+s.phase);lastSnapshot=Date.now();}
   await sleep(200);
  }
 }
 async waitPrepared(){
  let lastCheck=Date.now();
  for(;;){
   if(this.signal?.aborted)throw Error('runner shutting down');this.assertHealthy();
   const {command}=await this.post('/runner/command');
   if(command){
    if(command.kind==='snapshot'){await this.snapshot(this.preparationComplete?'ready':'needs_input',this.preparationComplete?'prepared session refresh':'preparation needs visual input');await this.post('/runner/ack',{commandId:command.commandId});}
    else if(command.kind==='stop'){this.stopped=true;await this.post('/runner/ack',{commandId:command.commandId});return 'stop';}
    else if(command.kind==='resume'){
     await this.post('/runner/start');this.operationStarted=true;this.deadline=this.job.spec.maxGameMinutes?Date.now()+this.job.spec.maxGameMinutes*60000:Infinity;
     await this.post('/runner/ack',{commandId:command.commandId});return 'start';
    }else await this.post('/runner/ack',{commandId:command.commandId,error:'activate the prepared session with resume first'});
   }
   if(Date.now()-lastCheck>10000){const s=await this.inspectGame(this.page),ready=!this.preparationFault&&s.state==='BASE'&&s.phase==='idle'&&(s.controls||[]).some(c=>['spin','ante','buy'].includes(c.category));if(ready!==this.preparationComplete){this.preparationComplete=ready;if(ready)this.preparedAt=Date.now();await this.snapshot(ready?'ready':'needs_input',ready?'demo prepared at BASE/idle':this.preparationFault||'prepared screen changed; inspect before operations');}lastCheck=Date.now();}
   await sleep(500);
  }
 }
 async close(){if(!this.closed){this.closed=true;await this.context?.close();}}
 async dismissIntro(control){
  const before=await this.snapshot('preparing','before known intro dismissal');
  let current=await this.inspectGame(this.page),c=current.controls?.find(x=>x.id===control.id&&x.category==='continue');
  if(current.state!=='INTRO'||!c)return false;
  await sleep(100);current=await this.inspectGame(this.page);const fresh=current.controls?.find(x=>x.id===c.id&&x.category==='continue');
  if(current.state!=='INTRO'||!fresh||Math.abs(fresh.x-c.x)+Math.abs(fresh.y-c.y)>.002)return false;c=fresh;
  if(![c.x,c.y].every(n=>Number.isFinite(n)&&n>=0&&n<=1))throw Error('invalid intro coordinates');
  const actionId=id(),record={category:'continue',purpose:'prepare-intro',label:c.label,x:c.x,y:c.y,path:c.path,controlId:c.id,observationId:before.id,beforeImage:before.imageKey,state:'INTRO',started:Date.now()};this.recorder.actionId=actionId;
  try{await this.page.mouse.click(c.x*1280,c.y*720);await sleep(200);await this.saveTrace(actionId,{...record,outcome:'intro-dismissed'});}
  catch(e){await this.saveTrace(actionId,{...record,outcome:'uncertain',reason:e.message}).catch(()=>{});throw e;}
  return true;
 }
 async snapshot(status,reason){
  const s=await this.inspectGame(this.page);const observation={id:id(),gameId:this.game.id,status,reason,state:s.state,phase:s.phase,controls:s.controls,viewport:{width:1280,height:720},frameRect:s.frameRect,progress:this.planner.summary(),capturedAt:Date.now(),...(this.preparedAt?{preparedAt:this.preparedAt}:{}),...(this.preparationFault?{preparationFault:this.preparationFault}:{})};
  const image=await this.page.screenshot({type:'jpeg',quality:65});observation.imageSha256=createHash('sha256').update(image).digest('hex');
  observation.imageKey=await this.upload(this.job.id+'/images/'+observation.id+'.jpg',image,'image/jpeg');
  this.lastObservation=observation;await this.post('/runner/heartbeat',{observation});return observation;
 }
 async saveTrace(actionId,record){
  const trace=await this.recorder.snapshot(actionId);
  await this.upload(this.job.id+'/traces/'+actionId+'.json',Buffer.from(JSON.stringify(trace)),'application/json');
  const action={...record,id:actionId,gameId:this.game.id,sequence:this.sequence++,finished:Date.now(),viewport:{width:1280,height:720},traceComplete:trace.complete,droppedEvents:trace.dropped,networkActionObserved:this.recorder.hasBet(actionId)};
  const s=await this.inspectGame(this.page);
  await this.post('/runner/action',{action,endpoints:summarizeTrace(trace),controls:s.controls});
  this.actions.push(action);this.recorder.drain();return action;
 }
 async click(control,{purpose='manual',actionId=id()}={}){
  if(!Number.isFinite(control.x)||!Number.isFinite(control.y)||control.x<0||control.y<0||control.x>1||control.y>1)throw Error('invalid click coordinates');
  const before=await this.snapshot('running','before '+control.label),started=Date.now();
  if(control.path){const current=await this.inspectGame(this.page);const fresh=current.controls.find(c=>c.id===control.id);if(!fresh)return {settled:{kind:'next',reason:'control-changed-before-click'},action:null};control=fresh;}
  const categoryName=control.category||category(control);
  this.recorder.actionId=actionId;
  const record={category:categoryName,label:control.label,x:control.x,y:control.y,controlId:control.id||null,path:control.path||null,observationId:before.id,beforeImage:before.imageKey,state:before.state,phase:before.phase,purpose,started};
  console.log(JSON.stringify({event:'click',game:this.game.id,label:control.label,purpose}));
  let settled;
  try{await this.page.mouse.click(control.x*1280,control.y*720);settled=await this.settle({purchase:purpose==='purchase'||categoryName==='buy',spin:['normal','ante-spin'].includes(purpose)||categoryName==='spin',ante:categoryName==='ante'});}catch(e){await this.saveTrace(actionId,{...record,outcome:this.stopped?'stopped':'uncertain',reason:e.message}).catch(error=>console.error(JSON.stringify({event:'evidence_save_failed',message:error.message})));throw e;}
  if(categoryName==='ante'&&settled.kind==='completed'){
   const current=await this.inspectGame(this.page),toggle=current.controls.find(c=>c.category==='ante');
   if(toggle&&toggle.id===control.id&&toggle.checked===control.checked&&toggle.label===control.label)settled={kind:'vision',reason:'ante-toggle-not-verified',continuations:settled.continuations};
  }
  let after;try{after=await this.snapshot(settled.kind==='vision'?'needs_input':'running',settled.reason||settled.kind);}catch(e){await this.saveTrace(actionId,{...record,outcome:'uncertain',reason:'post-action capture failed: '+e.message});throw e;}
  const action=await this.saveTrace(actionId,{...record,afterImage:after.imageKey,outcome:settled.kind,reason:settled.reason,continuations:settled.continuations||[]});
  return {settled,action};
 }
 async settle({purchase=false,spin=false,ante=false}={}){
  const started=Date.now(),continuations=[],progress=new ProgressWatchdog({stallSeconds:this.job.spec.stallSeconds??45});let stable=0,lastKey='',active=false,result=false,lastClick=null,lastClickAt=0,lastStopPoll=0,lastPublished=Date.now(),publishedStage='';
  await sleep(200);
  while(Date.now()<this.deadline){
   if(Date.now()-lastStopPoll>2000){await this.checkStop();lastStopPoll=Date.now();}
   const s=await this.inspectGame(this.page),cs=s.controls||[];
   const stage=s.state+'/'+s.phase;
   const revision=this.recorder.gameplayRevision?.(this.recorder.actionId)||0;
   progress.update({stage,revision,roundSignature:s.roundSignature});
   if(this.page&&(Date.now()-lastPublished>10000||(publishedStage&&stage!==publishedStage))){const observation=await this.snapshot('running','executing '+stage);progress.update({imageHash:observation.imageSha256});lastPublished=Date.now();console.log(JSON.stringify({event:'phase',game:this.game.id,state:s.state,phase:s.phase,elapsedMs:Date.now()-started}));}
   if(progress.stalled())return {kind:'vision',reason:'no-round-progress',continuations};
   publishedStage=stage;
   if(s.phase==='active'||s.phase==='spinning'||(!['awaiting_start','result','choice','awaiting_confirmation'].includes(s.phase)&&cs.some(c=>c.category==='active'))){active=true;stable=0;lastClick=null;await sleep(300);continue;}
   if(s.phase==='result')result=true;
   if(s.state==='BUY_MENU')return {kind:'menu',continuations};
   let allowed=[];
   if(s.state==='CONFIRM'&&purchase)allowed=cs.filter(c=>c.category==='confirm');
   if(s.state==='BONUS'&&['awaiting_start','result'].includes(s.phase))allowed=cs.filter(c=>c.category==='continue');
   if(allowed.length===1){
    let c=allowed[0];const key=s.state+'|'+s.phase+'|'+c.id;
    if(lastClick===key){if(Date.now()-lastClickAt>=2000)return {kind:'vision',reason:'continuation-did-not-advance',continuations};await sleep(250);continue;}
    const pre=await this.page.screenshot({type:'jpeg',quality:60});const imageKey=await this.upload(this.job.id+'/images/'+id()+'.jpg',pre,'image/jpeg');
    // Purchase windows animate in: a collider read before the screenshot may be
    // at a different position by the time the click is sent. Wait for geometry.
    let stableControl=false;
    for(let n=0;n<12;n++){await sleep(100);const current=await this.inspectGame(this.page);const fresh=current.controls.find(x=>x.id===c.id);if(!fresh)break;const delta=Math.abs(fresh.x-c.x)+Math.abs(fresh.y-c.y);c=fresh;if(delta<0.002){stableControl=true;break;}}
    if(!stableControl){await sleep(200);continue;}
    lastClick=key;lastClickAt=Date.now();
    continuations.push({...c,beforeImage:imageKey,at:Date.now()});
    console.log(JSON.stringify({event:'continue',game:this.game.id,label:c.label,phase:s.phase,x:c.x,y:c.y,path:c.path}));await this.page.mouse.click(c.x*1280,c.y*720);await sleep(350);stable=0;continue;
   }
   if(s.state==='BASE'&&s.phase==='idle'){
    const key=JSON.stringify(cs.map(c=>c.id));stable=key===lastKey?stable+1:0;lastKey=key;
    if(stable>=2){if(purchase&&!result){if(Date.now()-lastClickAt<3000){await sleep(300);continue;}return {kind:'vision',reason:'purchase-result-not-observed',continuations};}if(spin&&!active&&!this.recorder.hasBet(this.recorder.actionId)){if(Date.now()-started<1500){await sleep(300);continue;}return {kind:'vision',reason:'spin-not-observed',continuations};}return {kind:'completed',continuations};}
   }else if(s.state==='INTRO')return {kind:'next',continuations};
   else if(s.phase==='choice')return {kind:'vision',reason:'bonus-choice',continuations};
   else if(s.state==='UNKNOWN'&&Date.now()-started>1500)return {kind:'vision',reason:'unknown-screen',continuations};
   else stable=0;
   await sleep(300);
  }
  return {kind:'vision',reason:'transition-timeout',continuations};
 }
 async checkStop(){
  if(this.signal?.aborted)throw Error('runner shutting down');this.assertHealthy();
  if(Date.now()>this.deadline)throw Error('configured game execution budget reached');
  const {command}=await this.post('/runner/command');if(!command)return;
  if(command.kind==='snapshot'){await this.snapshot('running','live refresh');await this.post('/runner/ack',{commandId:command.commandId});return;}
  if(command.kind==='stop'){this.stopped=true;await this.post('/runner/ack',{commandId:command.commandId});throw Error('stopped by operator');}
  await this.post('/runner/ack',{commandId:command.commandId,error:'game is executing; wait for needs_input'});
 }
 async waitForInput(reason){
  await this.snapshot('needs_input',reason);const start=Date.now();
  const inputBudget=this.job.spec.inputTimeoutMinutes?this.job.spec.inputTimeoutMinutes*60000:Infinity;
  while(Date.now()-start<inputBudget&&Date.now()<this.deadline){
   if(this.signal?.aborted)throw Error('runner shutting down');this.assertHealthy();
   const {command}=await this.post('/runner/command');
   if(!command){await sleep(1000);continue;}
   try{
    if(command.kind==='snapshot'){await this.snapshot('needs_input',reason);await this.post('/runner/ack',{commandId:command.commandId});continue;}
    if(command.kind==='stop'){this.stopped=true;await this.post('/runner/ack',{commandId:command.commandId});return 'stop';}
    if(command.kind==='finish_game'){this.reviewedSummary=command.summary;await this.post('/runner/ack',{commandId:command.commandId});return 'finish';}
    if(command.kind==='resume'){
     if(!this.pendingAuto){await this.post('/runner/ack',{commandId:command.commandId});return 'resume';}
     const actionId=id();this.recorder.actionId=actionId;
     const settled=await this.settle({purchase:this.pendingAuto.purpose==='purchase',spin:['normal','ante-spin'].includes(this.pendingAuto.purpose)});
     await this.saveTrace(actionId,{category:'continue',label:'Resume existing round',purpose:'resume',started:Date.now(),outcome:settled.kind,continuations:settled.continuations||[]});
     await this.post('/runner/ack',{commandId:command.commandId});
     if(settled.kind==='completed')return 'action-completed';await this.snapshot('needs_input',settled.reason||settled.kind);continue;
    }
    if(command.observationId!==this.lastObservation?.id)throw Error('stale observation at execution');
    const {settled}=await this.click({...command,id:command.commandId},{actionId:command.commandId,purpose:command.category==='buy'||this.pendingAuto?.purpose==='purchase'?'purchase':'manual'});
    await this.post('/runner/ack',{commandId:command.commandId});
    if(settled.kind==='completed')return 'action-completed';
    if(settled.kind==='menu')return 'resume';
    await this.snapshot('needs_input',settled.reason);
   }catch(e){await this.post('/runner/ack',{commandId:command.commandId,error:e.message});throw e;}
  }
  throw Error('configured input wait budget reached; evidence retained');
 }
 async run(){
  try{
   if(!this.page)await this.open();
   for(let step=0;step<(this.job.spec.maxSteps??Infinity);step++){
    await this.checkStop();
    const s=await this.inspectGame(this.page),a=this.planner.next(s);
    if(a.kind==='done')return {gameId:this.game.id,status:'completed',...this.planner.summary(),actions:this.actions.length};
    if(a.kind==='wait'){
     const actionId=id(),started=Date.now();this.recorder.actionId=actionId;
     let settled;
     try{settled=await this.settle();await this.snapshot(settled.kind==='vision'?'needs_input':'running',settled.reason||settled.kind);await this.saveTrace(actionId,{category:'continue',label:'Observe active round',purpose:'wait',started,outcome:settled.kind,continuations:settled.continuations||[]});}
     catch(e){await this.saveTrace(actionId,{category:'continue',label:'Observe active round',purpose:'wait',started,outcome:this.stopped?'stopped':'uncertain',reason:e.message}).catch(()=>{});throw e;}
     if(settled.kind==='vision'){const answer=await this.waitForInput(settled.reason);if(answer==='stop')return {gameId:this.game.id,status:'stopped'};if(answer==='finish')return {gameId:this.game.id,status:'completed',coverage:'ChatGPT-reviewed',summary:this.reviewedSummary,...this.planner.summary()};}
     continue;
    }
    if(a.kind==='vision'){const answer=await this.waitForInput(a.reason);if(answer==='stop')return {gameId:this.game.id,status:'stopped'};if(a.reason==='purchase-menu-exhausted-return-to-base'&&answer==='action-completed')this.planner.completed({purpose:'close-menu'});if(answer==='finish')return {gameId:this.game.id,status:'completed',coverage:'ChatGPT-reviewed',summary:this.reviewedSummary,...this.planner.summary()};continue;}
    const {settled}=await this.click(a.control,{purpose:a.purpose});
    if(settled.kind==='completed')this.planner.completed(a);
    if(settled.kind==='menu')this.planner.openedMenu(a);
    if(settled.kind==='vision'){this.pendingAuto=a;const answer=await this.waitForInput(settled.reason);this.pendingAuto=null;if(answer==='action-completed')this.planner.completed(a);if(answer==='stop')return {gameId:this.game.id,status:'stopped'};if(answer==='finish')return {gameId:this.game.id,status:'completed',coverage:'ChatGPT-reviewed',summary:this.reviewedSummary,...this.planner.summary()};}
   }
   throw Error('step budget reached; suite incomplete');
  }catch(e){if(this.stopped)return {gameId:this.game.id,status:'stopped'};throw e;}finally{await this.close();}
 }
}
