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
