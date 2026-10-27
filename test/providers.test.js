import test from 'node:test';
import assert from 'node:assert/strict';
import urls from './catalog-urls.json' with {type:'json'};
import registry from '../shared/demo-providers.json' with {type:'json'};
import {demoUrl} from '../shared/contracts.js';

test('all 6753 Tester Spin catalog URLs across all 24 providers are admitted',()=>{
 assert.equal(urls.length,6753);
 assert.equal(new Set(urls.map(x=>x.provider)).size,24);
 assert.equal(Object.keys(registry.providers).length,24);
 for(const {provider,url} of urls) assert.doesNotThrow(()=>demoUrl(url),provider+': '+url);
});
test('provider launch origins preserve exact host and port boundaries',()=>{
 assert.doesNotThrow(()=>demoUrl('https://demo.bgaming-network.com/play/AlohaKingElvis/FUN?server=demo'));
 assert.doesNotThrow(()=>demoUrl('https://gs.1spin4win.com:10443/gmh5/games.html?freeplay=true'));
 for(const url of ['https://gs.1spin4win.com:9999/','https://demo.bgaming-network.com.evil.example/','https://127.0.0.1/','https://user:pass@demo.bgaming-network.com/']) assert.throws(()=>demoUrl(url));
});
