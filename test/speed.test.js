import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {speedInit} from '../runner/speed.js';
test('animation clock accelerates Date-based engines as well as RAF and timers',()=>{
 let elapsed=0;const timers=[];
 class DemoDate extends Date{constructor(...args){super(...(args.length?args:[5000+elapsed]));}static now(){return 5000+elapsed;}}
 const context={Date:DemoDate,performance:{now:()=>elapsed},setTimeout:(fn,ms)=>timers.push(ms),setInterval:()=>0,requestAnimationFrame:()=>0,document:{getAnimations:()=>[]}};
 vm.runInNewContext('('+speedInit.toString()+')(4)',context);
 elapsed=100;
 assert.equal(context.Date.now(),5400);assert.equal(new context.Date().getTime(),5400);
 context.setTimeout(()=>{},1000);assert.equal(timers[0],250);
});
