import fs from 'node:fs/promises';
export const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export class CloudClient{
 constructor(url,token){this.url=url.replace(/\/$/,'');this.token=token;}
 async post(path,body){
  const attempts=path==='/runner/command'?1:3;
  for(let i=0;i<attempts;i++){
   let r;try{r=await fetch(this.url+path,{method:'POST',headers:{authorization:'Bearer '+this.token,'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});}catch(e){if(i===attempts-1)throw e;await sleep(500*(i+1));continue;}
   if(r.status>=500&&i<attempts-1){await sleep(500*(i+1));continue;}
   const data=await r.json();if(!r.ok)throw Error(path+': '+(data.error||r.status));return data;
  }
 }
 async upload(jobId,runnerId,key,bytes,type){
  await fs.mkdir('artifacts/'+jobId,{recursive:true});
  await fs.writeFile('artifacts/'+key.replaceAll('/','__'),bytes);
  for(let i=0;i<3;i++){
   try{const r=await fetch(this.url+'/runner/evidence?'+new URLSearchParams({jobId,runnerId,key}),{method:'PUT',headers:{authorization:'Bearer '+this.token,'content-type':type,'content-length':String(bytes.length)},body:bytes,signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('evidence upload '+r.status);return;}catch(e){if(i===2)throw e;await sleep(1000);}
  }
 }
}
