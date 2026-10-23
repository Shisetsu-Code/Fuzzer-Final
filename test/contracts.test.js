import test from 'node:test';
import assert from 'node:assert/strict';
import {validateJob, validateAction, redact, endpointKey} from '../shared/contracts.js';

test('rejects authenticated or non-demo destinations and malformed game sets',()=>{
  assert.throws(()=>validateJob({games:[]}));
  assert.throws(()=>validateJob({games:[{id:'x',url:'http://127.0.0.1'}]}));
  assert.throws(()=>validateJob({games:[{id:'x',url:'https://user:pass@demogamesfree.pragmaticplay.net/'}]}));
  assert.throws(()=>validateJob({games:[{id:'x',url:'https://casino.example/'}]}));
  const j=validateJob({games:[{id:'olympus',url:'https://www.pragmaticplay.com/en/games/gates-of-olympus/'}]});
  assert.equal(j.speed,4); assert.equal(j.normalSpins,1);assert.equal(j.anteSpins,1);
});
test('coordinate commands need a current observation and a stable idempotency key',()=>{
  assert.throws(()=>validateAction({kind:'click',x:1.1,y:.2,observationId:'o',commandId:'c'}));
  assert.throws(()=>validateAction({kind:'click',x:.1,y:.2,commandId:'c'}));
  assert.deepEqual(validateAction({kind:'click',x:.1,y:.2,observationId:'o',commandId:'c',label:'Buy',category:'buy'}).x,.1);
});
test('redacts credentials recursively without removing game outcomes',()=>{
  assert.deepEqual(redact({token:'secret',balance:42,nested:{authorization:'x',action:'doSpin'}}),{token:'[REDACTED]',balance:42,nested:{authorization:'[REDACTED]',action:'doSpin'}});
  assert.equal(endpointKey('https://demo.example/spin?session=abc&action=doSpin'),'https://demo.example/spin');
});
test('ongoing demo runs have no internal time or step cutoff unless the caller supplies one',()=>{
 const games=[{id:'x',url:'https://demogamesfree.pragmaticplay.net/'}];
 const defaults=validateJob({games});assert.equal(defaults.maxGameMinutes,undefined);assert.equal(defaults.maxSteps,undefined);
 const configured=validateJob({games,maxGameMinutes:30,maxSteps:500,inputTimeoutMinutes:20,stallSeconds:90});
 assert.equal(configured.maxGameMinutes,30);assert.equal(configured.maxSteps,500);assert.equal(configured.inputTimeoutMinutes,20);assert.equal(configured.stallSeconds,90);
 assert.throws(()=>validateJob({games,maxGameMinutes:-1}));
});
