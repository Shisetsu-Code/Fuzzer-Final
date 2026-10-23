// Opt-in acceleration for DEMO UI animations. No clicks, spins or purchases.
// Installs in the game frame's main JS world; not a network/server speedup.
export function validateSpeed(value) {
  const n=Number(value);
  if(!Number.isFinite(n)||n<1||n>8)throw Error('speed must be between 1 and 8');
  return n;
}

// Must be self-contained: Playwright serializes this function into the page.
export function speedInit(factor) {
  if(typeof factor!=='number'||!Number.isFinite(factor)||factor<1||factor>8)return {installed:false,reason:'invalid speed'};
  const g=globalThis;
  const prior=g.__hybridFuzzerSpeed;
  if(prior){prior.factor=factor;return {installed:true,factor,updated:true};}
  if(factor===1)return {installed:false,factor};
  const realSetTimeout=g.setTimeout.bind(g),realSetInterval=g.setInterval.bind(g);
  const realRAF=typeof g.requestAnimationFrame==='function'?g.requestAnimationFrame.bind(g):null;
  const realNow=typeof g.performance?.now==='function'?g.performance.now.bind(g.performance):null;
  const origin=realNow?realNow():0;
  const state={factor};
  const accelerated=delay=>typeof delay==='number'&&Number.isFinite(delay)?Math.max(0,delay/state.factor):delay;
  g.setTimeout=(callback,delay,...args)=>realSetTimeout(callback,accelerated(delay),...args);
  g.setInterval=(callback,delay,...args)=>realSetInterval(callback,accelerated(delay),...args);
  if(realRAF)g.requestAnimationFrame=callback=>realRAF(timestamp=>callback(origin+(timestamp-origin)*state.factor));
  // Some engines advance animations with Date.now rather than RAF timestamps.
  // Virtualize the game frame's JS wall clock too; browser/TLS/server clocks
  // remain native. Use factor 1 for providers that bind client session expiry
  // to their animation clock.
  const NativeDate=g.Date;
  const nativeDateNow=NativeDate.now.bind(NativeDate),epoch=nativeDateNow();
  const virtualDateNow=()=>epoch+(nativeDateNow()-epoch)*state.factor;
  g.Date=new Proxy(NativeDate,{
    construct(target,args,newTarget){return Reflect.construct(target,args.length?args:[virtualDateNow()],newTarget);},
    apply(){return new NativeDate(virtualDateNow()).toString();},
    get(target,key,receiver){return key==='now'?virtualDateNow:Reflect.get(target,key,receiver);}
  });
  // The game engine's performance clock is optional: some browsers make it read-only.
  let virtualClock=false;
  if(realNow){try{
    Object.defineProperty(g.performance,'now',{configurable:true,value:()=>origin+(realNow()-origin)*state.factor});
    virtualClock=true;
  }catch{}}
  // Accelerate CSS/Web Animations when the game exposes them.
  if(typeof g.document?.getAnimations==='function'){
    const tune=()=>{try{for(const a of g.document.getAnimations())a.playbackRate=state.factor;}catch{}};
    tune();realSetInterval(tune,500);
  }
  Object.defineProperty(g,'__hybridFuzzerSpeed',{value:state,configurable:true});
  return {installed:true,factor,virtualClock};
}

export async function installSpeed(frame,factor){
  const n=validateSpeed(factor);
  return frame.evaluate(speedInit,n);
}

// Call after page navigation and again when a new game frame appears.
export async function speedUpGame(page,frame,factor){
  const n=validateSpeed(factor);
  if(!frame||frame.isDetached?.())return {installed:false,reason:'frame unavailable'};
  try{return await installSpeed(frame,n);}catch(error){return {installed:false,reason:String(error.message).slice(0,120)};}
}

