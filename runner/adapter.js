import {inspectPragmatic} from './pragmatic.js';
import {createHash} from 'node:crypto';
export const controlId=c=>createHash('sha256').update(c.path||c.label+'|'+c.x+'|'+c.y).digest('hex').slice(0,20);
export function refinePhase(data){
 const paths=(data.candidates||[]).map(c=>c.path||'');
 if(data.state==='BONUS'){
  if(paths.some(p=>/\/FreeSpins\/Content\/(?:RA\/)?(?:Result|End)\/ButtonContinue$/i.test(p)))return 'result';
  if(paths.some(p=>/\/FreeSpins\/Content\/(?:RA\/)?Start\/ButtonContinue$/i.test(p)))return 'awaiting_start';
 }
 return data.roundPhase;
}
export function category(c){
 const s=(c.path+' '+c.label).toLowerCase();
 if(/buttonskipintro|show.*next.*time/.test(s))return 'ignore';
 if(/buttonclose|closebutton|\bclose\b/.test(s))return 'close';
 if(/\/betlevel\/.*\/levels\/buttons\//.test(s))return 'ante';
 if(/cancel|buttonno|button_no|buttonclose|closebutton|settings|autoplay|sound|volume|paytable|help|menu_button|stake|betplus|betminus/.test(s))return 'ignore';
 if(/stopspin|stop_spin|\bstop\b/.test(s))return 'active';
 if(/intro|fsstart|fsresult|buttoncontinue|collect|click.*continue|tap.*continue|start.*free/.test(s))return 'continue';
 if(/buttonyes|button_yes|confirm|\byes\b/.test(s))return 'confirm';
 if(/ante|double.*chance|chance.*feature|extra.*bet|bet.*boost/.test(s))return 'ante';
 if(/purchase|buy|bonus.?buy/.test(s))return 'buy';
 if(/pick|choose|select|\/bonus\/content\/buttons\/b_/.test(s))return 'choice';
 if(/spin_button|spinbutton|\bspin\b/.test(s))return 'spin';
 return 'other';
}
export async function inspect(page){
 let best=null;
 for(const frame of page.frames()){
  if(frame.isDetached())continue;
  let data;try{data=await frame.evaluate(inspectPragmatic);}catch{continue;}
  if(!data.supported){try{data=await frame.evaluate(()=>{
   const candidates=[...document.querySelectorAll('button,[role=button],input[type=button],input[type=checkbox],a')].filter(e=>{const r=e.getBoundingClientRect();return r.width>8&&r.height>8&&getComputedStyle(e).visibility!=='hidden'&&getComputedStyle(e).display!=='none'&&!e.disabled;}).map(e=>{const r=e.getBoundingClientRect();return {label:e.getAttribute('aria-label')||e.innerText||e.value||e.getAttribute('title')||'',path:e.id?'#'+e.id:'',rect:{x:r.x/innerWidth,y:r.y/innerHeight,w:r.width/innerWidth,h:r.height/innerHeight},source:'dom',checked:e.checked??e.getAttribute('aria-checked')};}).filter(c=>c.label&&c.rect.x>=0&&c.rect.y>=0&&c.rect.x+c.rect.w<=1.01&&c.rect.y+c.rect.h<=1.01);
   return {supported:candidates.length>0,state:'UNKNOWN',roundPhase:'unknown',candidates};
  });}catch{continue;}}
  let box={x:0,y:0,width:1280,height:720};
  if(frame!==page.mainFrame()){try{const e=await frame.frameElement();box=await e.boundingBox();}catch{continue;}}
  if(!box||box.width<100||box.height<100)continue;
  data.roundPhase=refinePhase(data);
  const foreground=data.state==='INTRO'?data.candidates.filter(c=>/IntroScreen/.test(c.path)):data.candidates;
  const controls=foreground.map(c=>{const r=c.rect;return {...c,id:controlId(c),category:category(c),x:(box.x+(r.x+r.w/2)*box.width)/1280,y:(box.y+(r.y+r.h/2)*box.height)/720,frameRect:box,viewport:{width:1280,height:720}};}).filter(c=>c.x>=0&&c.x<=1&&c.y>=0&&c.y<=1);
  const score=(data.adapter==='pragmatic-runtime'?10000:0)+controls.length+box.width*box.height/10000;
  if(!best||score>best.score)best={score,state:data.state,phase:data.roundPhase,controls,frameUrl:frame.url(),frameRect:box};
 }
 return best||{state:'UNKNOWN',phase:'unknown',controls:[],frameRect:null};
}
