import test from 'node:test';
import assert from 'node:assert/strict';
import {SuitePlanner} from '../runner/planner.js';
import {category,refinePhase} from '../runner/adapter.js';
const c=(id,category,label=id)=>({id,category,label,x:.5,y:.5,path:id});
test('suite performs normal spins, Ante on/spin/off and every direct buy once',()=>{
 const p=new SuitePlanner({normalSpins:1,anteSpins:1,buyAll:true});
 const s={state:'BASE',phase:'idle',controls:[c('spin','spin'),c('ante','ante'),c('buy1','buy'),c('buy2','buy')]};
 let a=p.next(s);assert.equal(a.control.id,'spin');p.completed(a);
 a=p.next(s);assert.equal(a.control.id,'ante');p.completed(a);
 a=p.next(s);assert.equal(a.control.id,'spin');p.completed(a);
 a=p.next(s);assert.equal(a.control.id,'ante');p.completed(a);
 a=p.next(s);assert.equal(a.control.id,'buy1');p.completed(a);
 a=p.next(s);assert.equal(a.control.id,'buy2');p.completed(a);
 assert.equal(p.next(s).kind,'done');assert.equal(p.summary().purchases,2);
});
test('unknown canvas is an explicit vision request rather than an empty successful suite',()=>{
 assert.equal(new SuitePlanner({normalSpins:1,anteSpins:1,buyAll:true}).next({state:'UNKNOWN',controls:[]}).kind,'vision');
});
test('Pragmatic intro checkbox is not play and BetLevel is Ante rather than purchase',()=>{
 assert.equal(category({path:'GameRoot/IntroScreen/IntroButtons/ButtonSkipIntro/Button',label:"DON’T SHOW NEXT TIME"}),'ignore');
 assert.equal(category({path:'GameRoot/IntroScreen/IntroButtons/PlayButtonIntro',label:'Spin_Normal'}),'continue');
 assert.equal(category({path:'Root/Game/BuyBetFeatures/BetLevel/RA/Levels/Buttons/AT/Level_0',label:'BET / $2.50'}),'ante');
});
test('purchase menu is reopened only for unseen variants then opener is exhausted',()=>{
 const p=new SuitePlanner({normalSpins:0,anteSpins:0,buyAll:true});
 const base={state:'BASE',phase:'idle',controls:[c('open','buy')]};
 const menu={state:'BUY_MENU',controls:[c('one','buy'),c('two','buy'),c('close','close')]};
 p.openedMenu(p.next(base));let a=p.next(menu);assert.equal(a.control.id,'one');p.completed(a);
 p.openedMenu(p.next(base));a=p.next(menu);assert.equal(a.control.id,'two');p.completed(a);
 p.openedMenu(p.next(base));a=p.next(menu);assert.equal(a.purpose,'close-menu');p.completed(a);
 assert.equal(p.next(base).kind,'done');assert.equal(p.summary().purchases,2);
});
test('bonus Start numeric continuation overrides background StopSpin active state',()=>{
 const data={state:'BONUS',roundPhase:'active',candidates:[{path:'Root/FreeSpins/Content/RA/Start/ButtonContinue',label:'15'},{path:'Root/SpinButtons/StopSpin_Button',label:'ananas'}]};
 assert.equal(refinePhase(data),'awaiting_start');
});
