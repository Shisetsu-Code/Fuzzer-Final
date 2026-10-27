import test from 'node:test';import assert from 'node:assert/strict';
import {values,isSpinRequest} from './protocol.mjs';
const p=value=>({encoding:'base64',data:Buffer.from(JSON.stringify(value)).toString('base64')});
test('total cost is read from response, and wallet plus pending prize forms balance',()=>{
 const request={command:'spin',options:{bet:40,mode:'2'}},response={outcome:{bet:120,win:50},balance:{wallet:99880,game:50}};
 assert.equal(isSpinRequest({stage:'request',request:{body:p(request)}}),true);
 assert.deepEqual(values([{stage:'response',request:{body:p(request)},response:{body:p(response)}}]),{transport:'http',requestedBet:40,cost:120,win:50,balance:99930});
});
