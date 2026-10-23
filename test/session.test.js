import test from 'node:test';
import assert from 'node:assert/strict';
import {GameSession} from '../runner/session.js';
test('an ignored spin click is incomplete unless round lifecycle or spin request was observed',async()=>{
 const session=new GameSession({game:{id:'fixture'},job:{spec:{}},cloud:{post:async()=>({command:null})},inspectGame:async()=>({state:'BASE',phase:'idle',controls:[]})});
 session.recorder={hasBet:()=>false,actionId:'test'};
 const outcome=await session.settle({spin:true});assert.equal(outcome.kind,'vision');assert.equal(outcome.reason,'spin-not-observed');
});
