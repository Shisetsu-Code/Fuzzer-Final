export class ProgressWatchdog{
 constructor({stallSeconds=45,now=Date.now}={}){this.now=now;this.window=stallSeconds*1000;this.lastProgress=now();this.signals={};}
 update(signals){let changed=false;for(const [key,value] of Object.entries(signals)){if(value!==undefined&&value!==this.signals[key]){changed=true;this.signals[key]=value;}}if(changed)this.lastProgress=this.now();return changed;}
 stalled(){return this.now()-this.lastProgress>this.window;}
}
