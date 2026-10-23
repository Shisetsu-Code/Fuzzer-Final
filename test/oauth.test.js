import test from 'node:test';
import assert from 'node:assert/strict';
import {validRedirect,pkceChallenge} from '../src/oauth.js';
test('OAuth accepts ChatGPT HTTPS redirects and enforces S256 challenge shape',async()=>{
 assert.equal(validRedirect('https://chatgpt.com/connector_platform/oauth_redirect'),true);
 assert.equal(validRedirect('https://chatgpt.com.evil.example/redirect'),false);
 assert.equal(validRedirect('http://chatgpt.com/redirect'),false);
 assert.equal(await pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'),'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
});
