// Keep every independent demo active without moving OS/window focus between jobs.
export const foregroundArgs=[
 '--autoplay-policy=no-user-gesture-required',
 '--disable-background-timer-throttling',
 '--disable-renderer-backgrounding',
 '--disable-backgrounding-occluded-windows'
];
export async function keepPageActive(context,page){
 // Focus emulation keeps Chromium rendering; a nested game document must also
 // report focus even when the actual active element belongs to the host page.
 const focusInit=()=>{Object.defineProperty(Document.prototype,'hasFocus',{configurable:true,value:()=>true});};
 await context.addInitScript(focusInit);
 await page.evaluate(focusInit);
 const client=await context.newCDPSession(page);
 await client.send('Emulation.setFocusEmulationEnabled',{enabled:true});
 // Keep the CDP session attached for the entire page lifetime: detaching resets emulation.
 return client;
}
