import test from 'node:test';
import assert from 'node:assert/strict';
import {GameSession} from '../runner/session.js';
test('an ignored spin click is incomplete unless round lifecycle or spin request was observed',async()=>{
 const session=new GameSession({game:{id:'fixture'},job:{spec:{}},cloud:{post:async()=>({command:null})},inspectGame:async()=>({state:'BASE',phase:'idle',controls:[]})});
 session.recorder={hasBet:()=>false,actionId:'test'};
 const outcome=await session.settle({spin:true});assert.equal(outcome.kind,'vision');assert.equal(outcome.reason,'spin-not-observed');
});
test('an uncertain click error preserves the available action trace before closing',async()=>{
 const control={id:'spin',path:'spin',label:'Spin',category:'spin',x:.5,y:.5};
 const session=new GameSession({game:{id:'fixture'},job:{spec:{}},inspectGame:async()=>({controls:[control]})});
 session.snapshot=async()=>({id:'o',imageKey:'before.jpg',state:'BASE',phase:'idle'});
 session.page={mouse:{click:async()=>{throw Error('transport lost');}}};session.recorder={};
 const saved=[];session.saveTrace=async(id,record)=>saved.push(record);
 await assert.rejects(()=>session.click(control),/transport lost/);
 assert.equal(saved[0]?.outcome,'uncertain');assert.equal(saved[0]?.label,'Spin');
});
test('an already-active game uses the progress monitor instead of an unbounded sleep loop',async()=>{
 const session=new GameSession({game:{id:'fixture'},job:{spec:{maxSteps:1}},cloud:{post:async()=>({command:null})},inspectGame:async()=>({state:'BASE',phase:'spinning',controls:[]})});
 session.open=async()=>{};session.recorder={};session.snapshot=async()=>({});session.saveTrace=async()=>{};
 session.settle=async()=>({kind:'vision',reason:'no-round-progress'});session.waitForInput=async()=> 'stop';
 assert.equal((await session.run()).status,'stopped');
});
test('preparation dismisses only the intro, parks BASE/idle and reuses the loaded page on activation',async()=>{
 let state={state:'INTRO',phase:'unknown',controls:[{id:'intro',category:'continue',label:'Play intro',path:'IntroScreen/PlayButtonIntro'}]};
 const posts=[],clicks=[],page={};let opens=0;
 const session=new GameSession({game:{id:'fixture'},job:{id:'prepared',spec:{prepareOnly:true,normalSpins:0,anteSpins:0,buyAll:false,maxGameMinutes:1}},cloud:{post:async(path,body)=>{posts.push({path,body});return {ok:true};}},inspectGame:async()=>state});
 session.open=async()=>{opens++;session.page=page;session.recorder={events:[],hasBet:()=>false};};session.dismissPageOverlays=async()=>{};
 session.dismissIntro=async c=>{clicks.push(c.category);state={state:'BASE',phase:'idle',controls:[{id:'spin',category:'spin'}]};return true;};
 session.snapshot=async(status,reason)=>{const observation={status,reason,state:state.state,phase:state.phase,controls:state.controls};session.lastObservation=observation;return observation;};
 const ready=await session.prepare();assert.equal(ready.ready,true);assert.equal(session.lastObservation.status,'ready');assert.deepEqual(clicks,['continue']);
 assert.equal(session.deadline,Infinity);
 let sent=false;session.post=async(path,body)=>{posts.push({path,body});if(path==='/runner/command'&&!sent){sent=true;return {command:{kind:'resume',commandId:'start'}};}return {ok:true,command:null};};
 assert.equal(await session.waitPrepared(),'start');assert.ok(posts.some(p=>p.path==='/runner/start'));
 const result=await session.run();assert.equal(result.status,'completed');assert.equal(opens,1);assert.equal(session.page,page);
});
test('preparation never claims a promotional or unknown screen is ready',async()=>{
 const session=new GameSession({game:{id:'fixture'},job:{id:'p',spec:{prepareOnly:true,stallSeconds:1}},inspectGame:async()=>({state:'UNKNOWN',phase:'unknown',controls:[{id:'corporate-link',category:'other'}]})});
 session.page={};session.recorder={events:[]};session.dismissPageOverlays=async()=>{};session.checkStop=async()=>{};
 session.snapshot=async(status,reason)=>{session.lastObservation={status,reason};return session.lastObservation;};
 assert.equal((await session.prepare()).ready,false);assert.equal(session.lastObservation.status,'needs_input');
});
test('intro preparation does not start a bonus continuation that appears afterward',async()=>{
 const intro={id:'intro',path:'IntroScreen/PlayButtonIntro',category:'continue',label:'Play',x:.5,y:.5};let state={state:'INTRO',phase:'unknown',controls:[intro]};
 const session=new GameSession({game:{id:'fixture'},job:{id:'p',spec:{prepareOnly:true}},inspectGame:async()=>state});
 session.page={mouse:{click:async()=>{state={state:'BONUS',phase:'awaiting_start',controls:[]};}}};session.recorder={};session.snapshot=async()=>({id:'before',imageKey:'image',state:'INTRO',phase:'unknown'});session.saveTrace=async()=>{};session.settle=async()=>assert.fail('preparation must not invoke round continuations');
 assert.equal(await session.dismissIntro(intro),true);assert.equal(state.state,'BONUS');
});
test('unexpected gameplay during preparation stays blocked even if BASE reappears',async()=>{
 const session=new GameSession({game:{id:'fixture'},job:{id:'p',spec:{prepareOnly:true}},inspectGame:async()=>({state:'BASE',phase:'idle',controls:[{id:'spin',category:'spin'}]})});
 session.page={};session.recorder={events:[]};session.actions=[{networkActionObserved:true}];session.dismissPageOverlays=async()=>{};session.checkStop=async()=>{};session.snapshot=async status=>({status});
 assert.equal((await session.prepare()).ready,false);session.actions=[];
 assert.equal((await session.prepare()).ready,false);assert.ok(session.preparationFault);
});
