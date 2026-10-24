import {chromium} from 'playwright';
import {CloudClient} from './client.js';
import {serveRunner} from './pool.js';
const url=process.env.FUZZER_URL,token=process.env.FUZZER_RUNNER_TOKEN;
if(!url||!token)throw Error('FUZZER_URL and FUZZER_RUNNER_TOKEN required');
const runnerId='gh-'+(process.env.GITHUB_RUN_ID||crypto.randomUUID())+'-'+(process.env.GITHUB_RUN_ATTEMPT||'1');
const cloud=new CloudClient(url,token),controller=new AbortController();
for(const event of ['SIGINT','SIGTERM'])process.once(event,()=>controller.abort());
const capacity=Number(process.env.PRELOAD_SLOTS||2),idleMinutes=Number(process.env.RUNNER_IDLE_MINUTES??10);
if(!Number.isFinite(idleMinutes)||idleMinutes<0)throw Error('RUNNER_IDLE_MINUTES must be nonnegative (0 keeps an idle runner online)');
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}),args:['--autoplay-policy=no-user-gesture-required']});
try{await serveRunner({cloud,browser,runnerId,capacity,signal:controller.signal,idleMs:idleMinutes===0?Infinity:idleMinutes*60000});}
finally{await browser.close();}
