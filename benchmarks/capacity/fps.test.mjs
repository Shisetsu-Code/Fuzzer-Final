import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {limitFrames} from './fps.mjs';
function fixture(fps){
 let id=0,now=0;const callbacks=new Map(),clock=()=>now,timer=()=>{};
 const world={performance:{now:clock},Date,setTimeout:timer,setInterval:timer,queueMicrotask:fn=>fn(),requestAnimationFrame:cb=>(callbacks.set(++id,cb),id),cancelAnimationFrame:key=>callbacks.delete(key)};
 vm.runInNewContext('('+limitFrames.toString()+')('+fps+')',world);
 return {world,clock,timer,tick(t){now=t;const batch=[...callbacks.values()];callbacks.clear();for(const cb of batch)cb(t);}};
}
test('30 FPS preserves real timestamps and leaves clocks/timers untouched',()=>{
 const f=fixture(30),timestamps=[];function step(t){timestamps.push(t);f.world.requestAnimationFrame(step);}f.world.requestAnimationFrame(step);
 for(let i=0;i<=60;i++)f.tick(i*1000/60);
 assert(timestamps.length>=29&&timestamps.length<=31);assert.equal(timestamps.at(-1),1000);
 assert.equal(f.world.performance.now,f.clock);assert.equal(f.world.setTimeout,f.timer);assert.equal(f.world.setInterval,f.timer);assert.equal(f.world.Date,Date);
});
test('multiple loops survive and cancellation works within a dispatched batch',()=>{
 const f=fixture(15),called=[];
 f.world.requestAnimationFrame(()=>{called.push('first');f.world.cancelAnimationFrame(second);});
 const second=f.world.requestAnimationFrame(()=>called.push('cancelled'));
 f.world.requestAnimationFrame(()=>called.push('third'));f.tick(0);
 assert.deepEqual(called,['first','third']);
});
