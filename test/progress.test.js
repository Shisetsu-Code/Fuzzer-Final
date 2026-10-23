import test from 'node:test';
import assert from 'node:assert/strict';
import {ProgressWatchdog} from '../runner/progress.js';
test('visible animation progress keeps a long round running even without new HTTP or phase changes',()=>{
 let now=0;const p=new ProgressWatchdog({stallSeconds:45,now:()=>now});
 p.update({stage:'BONUS/active',revision:1,imageHash:'a'});
 for(let i=1;i<=60;i++){now=i*10000;p.update({imageHash:'frame-'+i});assert.equal(p.stalled(),false);}
 now+=46000;assert.equal(p.stalled(),true);
 now+=1;p.update({revision:2});assert.equal(p.stalled(),false);
});
