import {chromium} from 'playwright';
import {CloudClient,sleep} from './client.js';
import {GameSession} from './session.js';
const url=process.env.FUZZER_URL,token=process.env.FUZZER_RUNNER_TOKEN;
if(!url||!token)throw Error('FUZZER_URL and FUZZER_RUNNER_TOKEN required');
const runnerId='gh-'+(process.env.GITHUB_RUN_ID||crypto.randomUUID())+'-'+(process.env.GITHUB_RUN_ATTEMPT||'1');
const cloud=new CloudClient(url,token),started=Date.now();let browser;
while(Date.now()-started<45*60000){
 const {job}=await cloud.post('/runner/claim',{runnerId});if(!job){if(Date.now()-started>60000)break;await sleep(2000);continue;}
 console.log(JSON.stringify({event:'job_started',id:job.id,games:job.spec.games.map(g=>g.id)}));
 browser??=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}),args:['--autoplay-policy=no-user-gesture-required']});
 let heartbeatError=null,heartbeatBusy=false;
 const heartbeat=setInterval(async()=>{if(heartbeatBusy)return;heartbeatBusy=true;try{await cloud.post('/runner/heartbeat',{jobId:job.id,runnerId});}catch(e){heartbeatError=e;}finally{heartbeatBusy=false;}},10000);
 const results=[];
 try{
  for(const game of job.spec.games){if(heartbeatError)throw heartbeatError;try{const session=new GameSession({browser,cloud,job,runnerId,game});results.push(await session.run());}catch(e){results.push({gameId:game.id,status:'error',error:e.message});console.error(JSON.stringify({event:'game_error',game:game.id,message:e.message}));}}
  await cloud.post('/runner/finish',{jobId:job.id,runnerId,result:results,...(results.some(r=>r.status!=='completed')?{error:'one or more games incomplete'}:{})});
 }finally{clearInterval(heartbeat);}
}
await browser?.close();
