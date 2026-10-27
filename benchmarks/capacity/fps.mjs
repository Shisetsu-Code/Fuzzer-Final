// Benchmark-only rendering cap. Real clocks, network and timers stay native.
export function limitFrames(fps){
 if(!fps)return;
 const nativeRAF=globalThis.requestAnimationFrame.bind(globalThis),callbacks=new Map();
 let next=1,pending=null,last=-Infinity;
 const stats={fps,deliveredFrames:0,installedAt:performance.now()};
 Object.defineProperty(globalThis,'__capacityFrameCap',{value:stats});
 function pump(timestamp){
  pending=null;
  if(timestamp-last>=1000/fps-.5){
   last=timestamp;stats.deliveredFrames++;
   for(const [id,callback] of [...callbacks]){
    if(!callbacks.has(id))continue;callbacks.delete(id);
    try{callback(timestamp);}catch(error){queueMicrotask(()=>{throw error;});}
   }
  }
  if(callbacks.size&&pending===null)pending=nativeRAF(pump);
 }
 globalThis.requestAnimationFrame=callback=>{
  if(typeof callback!=='function')throw new TypeError('callback must be a function');
  const id=next++;callbacks.set(id,callback);if(pending===null)pending=nativeRAF(pump);return id;
 };
 globalThis.cancelAnimationFrame=id=>callbacks.delete(id);
}
