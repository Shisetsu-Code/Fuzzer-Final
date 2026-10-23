import test from 'node:test';
import assert from 'node:assert/strict';
import {encodePayload, summarizeTrace,Recorder} from '../runner/recorder.js';
import {EventEmitter} from 'node:events';
test('binary WebSocket payloads remain lossless and action endpoints have transport and method',()=>{
 assert.deepEqual(encodePayload(Buffer.from([0,255,1])),{encoding:'base64',data:'AP8B',bytes:3,truncated:false});
 const rows=summarizeTrace({events:[{transport:'http',method:'POST',url:'https://demo.example/game?session=1'},{transport:'ws',direction:'sent',url:'wss://demo.example/socket',payload:{data:'spin'}},{transport:'http',method:'POST',url:'https://demo.example/game?session=2'}]});
 assert.equal(rows.find(x=>x.transport==='http').count,2);
 assert.equal(rows.find(x=>x.transport==='ws').method,'sent');
});
test('truncated payload or unavailable body makes evidence explicitly incomplete',async()=>{
 const r=new Recorder(new EventEmitter());r.add({actionId:'a',transport:'ws',payload:encodePayload(Buffer.from('123456'),2)});
 assert.equal((await r.snapshot('a')).complete,false);
});
