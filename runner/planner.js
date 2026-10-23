export class SuitePlanner{
 constructor(spec){this.spec=spec;this.normal=0;this.ante=0;this.anteOn=false;this.bought=new Set();this.absent=new Set();this.menuOpener=null;this.menuVisited=new Set();this.exhausted=new Set();}
 openedMenu(a){this.menuOpener=a.purchaseKey;}
 next(s){
  const controls=s.controls||[],get=k=>controls.filter(c=>c.category===k);
  if(s.phase==='spinning'||s.phase==='active'||get('active').length)return {kind:'wait'};
  if(s.state==='INTRO')return get('continue').length===1?{kind:'click',control:get('continue')[0],purpose:'intro'}:{kind:'vision',reason:'intro'};
  if(s.state==='UNKNOWN')return {kind:'vision',reason:'unknown-screen'};
  if(s.state==='BUY_MENU'){
   const options=get('buy').filter(c=>!this.menuVisited.has(c.id));
   if(options.length)return {kind:'click',control:options[0],purpose:'purchase',purchaseKey:options[0].id};
   if(get('close').length===1)return {kind:'click',control:get('close')[0],purpose:'close-menu'};
   return {kind:'vision',reason:'purchase-menu-exhausted-return-to-base'};
  }
  if(s.state!=='BASE'||s.phase!=='idle')return {kind:'vision',reason:'unrecognized-phase'};
  if(this.normal<this.spec.normalSpins){if(get('spin').length===1)return {kind:'click',control:get('spin')[0],purpose:'normal'};this.absent.add('normal-spin');}
  const ante=get('ante');
  if(this.ante<this.spec.anteSpins&&ante.length===1){
   if(!this.anteOn)return {kind:'click',control:ante[0],purpose:'ante-on'};
   if(get('spin').length===1)return {kind:'click',control:get('spin')[0],purpose:'ante-spin'};
  }else if(this.spec.anteSpins&&!ante.length)this.absent.add('ante');
  if(this.anteOn&&ante.length===1)return {kind:'click',control:ante[0],purpose:'ante-off'};
  if(this.spec.buyAll){const buys=get('buy').filter(c=>!this.bought.has(c.id)&&!this.exhausted.has(c.id));if(buys.length)return {kind:'click',control:buys[0],purpose:'purchase',purchaseKey:buys[0].id};if(!get('buy').length)this.absent.add('buy');}
  return {kind:'done'};
 }
 completed(a){
  if(a.purpose==='normal')this.normal++;
  if(a.purpose==='ante-spin')this.ante++;
  if(a.purpose==='ante-on')this.anteOn=true;
  if(a.purpose==='ante-off')this.anteOn=false;
  if(a.purpose==='purchase'){this.bought.add(a.purchaseKey);this.menuVisited.add(a.purchaseKey);}
  if(a.purpose==='close-menu'){this.exhausted.add(this.menuOpener);this.menuOpener=null;}
 }
 summary(){return {normalSpins:this.normal,anteSpins:this.ante,purchases:this.bought.size,unavailable:[...this.absent]};}
}
