import test from 'node:test';
import assert from 'node:assert/strict';
import {serveRunner} from '../runner/pool.js';

test('another demo prepares while the first ready session waits, without starting operations',async()=>{
 const controller=new AbortController(),prepared=[],finished=[],presence=[];let releases=[];
 const jobs=[1,2].map(i=>({id:'job-'+i,spec:{prepareOnly:true,games:[{id:'game-'+i}]}}));
 const cloud={async post(path,body){
  if(path==='/runner/claim'){assert.equal(body.supportsPreparation,true);return {job:jobs.shift()||null};}
  if(path==='/runner/presence'){presence.push(body);return {ok:true};}
  if(path==='/runner/finish'){finished.push(body);if(finished.length===2)controller.abort();return {ok:true};}
  return {ok:true};
 }};
 class Session{
  constructor({game}){this.game=game;}
  async prepare(){prepared.push(this.game.id);return {ready:true};}
  async waitPrepared(){return new Promise(resolve=>{releases.push(()=>resolve('stop'));if(releases.length===2){assert.deepEqual(new Set(prepared),new Set(['game-1','game-2']));for(const release of releases)release();}});}
  async run(){assert.fail('preparation must not perform operations before activation');}
  async close(){}
 }
 await serveRunner({cloud,browser:{},runnerId:'service',capacity:2,Session,signal:controller.signal,pollMs:1,idleMs:100,log:()=>{}});
 assert.equal(finished.length,2);assert.equal(presence[0].browserReady,true);assert.equal(presence.at(-1).browserReady,false);
 assert.notEqual(finished[0].runnerId,finished[1].runnerId);
});

test('an unacknowledged finish retires its slot rather than reopening the same game',async()=>{
 const controller=new AbortController();let claims=0,plays=0;
 const cloud={async post(path){if(path==='/runner/claim'){claims++;return {job:{id:'one',spec:{games:[{id:'one'}]}}};}if(path==='/runner/finish')throw Error('finish response unavailable');return {ok:true};}};
 class Session{async run(){plays++;return {status:'completed'};}async close(){}}
 await assert.rejects(()=>serveRunner({cloud,browser:{},runnerId:'service',capacity:1,Session,signal:controller.signal,pollMs:1,idleMs:10,log:()=>{}}),/slot failed/);
 assert.equal(claims,1);assert.equal(plays,1);
});
test('a presence-report error after claiming a job does not strand its browser slot',async()=>{
 const controller=new AbortController();let claimed=false,played=0,reportedFailure=false;
 const cloud={async post(path,b){if(path==='/runner/claim'){if(claimed)return {job:null};claimed=true;return {job:{id:'one',spec:{games:[{id:'one'}]}}};}if(path==='/runner/presence'&&b.busy===1&&!reportedFailure){reportedFailure=true;throw Error('temporary presence failure');}if(path==='/runner/finish')controller.abort();return {ok:true};}};
 class Session{async run(){played++;return {status:'completed'};}async close(){}}
 await serveRunner({cloud,browser:{},runnerId:'service',capacity:1,Session,signal:controller.signal,pollMs:1,idleMs:10,log:()=>{}});
 assert.equal(played,1);
});
