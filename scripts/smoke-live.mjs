import {chromium} from 'playwright';
import {GameSession} from '../runner/session.js';
import fs from 'node:fs/promises';
const root='artifacts/live';await fs.mkdir(root,{recursive:true});
const cloud={async post(route,body){if(route==='/runner/command')return {command:null};if(route==='/runner/heartbeat'&&body.observation?.status==='needs_input')await fs.writeFile(root+'/blocked.json',JSON.stringify(body.observation,null,2));if(route==='/runner/action')await fs.writeFile(root+'/'+body.action.id+'.action.json',JSON.stringify(body,null,2));return {ok:true};},async upload(jobId,runnerId,key,bytes){await fs.writeFile(root+'/'+key.replaceAll('/','__'),bytes);}};
GameSession.prototype.waitForInput=async function(reason){await this.snapshot('needs_input',reason);throw Error('live smoke needs visual input: '+reason);};
const browser=await chromium.launch({headless:true});
try{const session=new GameSession({browser,cloud,job:{id:'live',spec:{speed:4,normalSpins:1,anteSpins:1,buyAll:true}},runnerId:'local-smoke',game:{id:'gates-of-olympus',url:'https://demogamesfree.pragmaticplay.net/gs2c/openGame.do?gameSymbol=vs20olympgate&websiteUrl=https%3A%2F%2Fdemogamesfree.pragmaticplay.net&jurisdiction=99&lang=en&cur=USD'}});const result=await session.run();await fs.writeFile(root+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));}finally{await browser.close();}
