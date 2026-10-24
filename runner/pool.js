import {GameSession} from './session.js';
import {sleep} from './client.js';

export async function executeJob({cloud,browser,job,runnerId,Session=GameSession,signal,log=console.log}){
 let heartbeatError=null,heartbeatBusy=false;
 const heartbeat=setInterval(async()=>{if(heartbeatBusy)return;heartbeatBusy=true;try{await cloud.post('/runner/heartbeat',{jobId:job.id,runnerId});}catch(e){heartbeatError=e;}finally{heartbeatBusy=false;}},10000);
 const results=[];
 try{
  for(const game of job.spec.games){
   if(heartbeatError)throw heartbeatError;
   const session=new Session({browser,cloud,job,runnerId,game,signal,assertHealthy:()=>{if(heartbeatError)throw heartbeatError;}});
   try{
    if(job.spec.prepareOnly){await session.prepare();if(await session.waitPrepared()==='stop'){results.push({gameId:game.id,status:'stopped'});break;}}
    const result=await session.run();results.push(result);if(result.status==='stopped')break;
   }catch(e){results.push({gameId:game.id,status:session.stopped?'stopped':'error',error:e.message});log(JSON.stringify({event:'game_error',game:game.id,message:e.message}));if(session.stopped)break;}
   finally{await session.close();}
  }
  await cloud.post('/runner/finish',{jobId:job.id,runnerId,result:results,...(results.some(r=>r.status!=='completed')?{error:'one or more games incomplete'}:{})});
  return results;
 }finally{clearInterval(heartbeat);}
}

export async function serveRunner({cloud,browser,runnerId,capacity=2,Session=GameSession,signal,pollMs=2000,idleMs=600000,log=console.log}){
 if(!Number.isSafeInteger(capacity)||capacity<1||capacity>16)throw Error('PRELOAD_SLOTS must be 1..16');
 const active=new Set(),live=new Set(Array.from({length:capacity},(_,i)=>i)),errors=[];let lastActivity=Date.now(),presenceBusy=false;
 const presence=async(browserReady=true)=>cloud.post('/runner/presence',{runnerId,capacity:Math.max(1,live.size),busy:active.size,browserReady:browserReady&&live.size>0});
 await presence();
 const heartbeat=setInterval(async()=>{if(presenceBusy)return;presenceBusy=true;try{await presence();}catch(e){log(JSON.stringify({event:'presence_error',message:e.message}));}finally{presenceBusy=false;}},10000);
 const slot=async index=>{
  const owner=runnerId+'-slot'+index;
  try{
   while(!signal?.aborted){
    const {job}=await cloud.post('/runner/claim',{runnerId:owner,supportsPreparation:true});
    if(job){
     active.add(index);lastActivity=Date.now();await presence().catch(e=>log(JSON.stringify({event:'presence_error',message:e.message})));
     log(JSON.stringify({event:'job_started',id:job.id,slot:index,preparing:!!job.spec.prepareOnly,games:job.spec.games.map(g=>g.id)}));
     try{await executeJob({cloud,browser,job,runnerId:owner,Session,signal,log});}
     finally{active.delete(index);lastActivity=Date.now();await presence().catch(e=>log(JSON.stringify({event:'presence_error',message:e.message})));}
    }else{
     if(active.size)lastActivity=Date.now();
     else if(Date.now()-lastActivity>=idleMs)break;
     await sleep(pollMs);
    }
   }
  }catch(e){errors.push(e);log(JSON.stringify({event:'slot_retired',slot:index,message:e.message}));}
  finally{live.delete(index);await presence().catch(()=>{});}
 };
 try{await Promise.all(Array.from({length:capacity},(_,i)=>slot(i)));}
 finally{clearInterval(heartbeat);await presence(false).catch(()=>{});}
 if(errors.length)throw new AggregateError(errors,'runner slot failed; uncertain jobs were not reopened');
}
