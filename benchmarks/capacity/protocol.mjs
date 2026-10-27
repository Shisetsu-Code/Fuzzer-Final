export function decode(payload){
 if(!payload?.data)return null;
 let text=payload.encoding==='base64'?Buffer.from(payload.data,'base64').toString('utf8'):payload.data;
 if(text.startsWith('3:::'))text=text.slice(4);
 try{return JSON.parse(text);}catch{return null;}
}
export function isSpinRequest(event){
 if(event.transport==='ws'&&event.direction==='sent')return decode(event.payload)?.data?._type==='com.pt.casino.platform.game.GameCommand';
 return event.stage==='request'&&decode(event.request?.body)?.command==='spin';
}
export function values(events){
 let result=null;const balances=[];
 for(const event of events){
  if(event.transport==='ws'&&event.direction==='received'){
   const data=decode(event.payload)?.data;
   if(data?.balance?.[0]?.amount!==undefined)balances.push(data.balance[0].amount);
   if(data?.stakeAmount!==undefined&&data?.winAmount!==undefined)result={transport:'ws',cost:data.stakeAmount,win:data.winAmount};
  }
  if(event.stage==='response'&&decode(event.request?.body)?.command==='spin'){
   const response=decode(event.response?.body),request=decode(event.request.body);
   if(response?.outcome&&response.balance)result={transport:'http',requestedBet:request.options?.bet,cost:response.outcome.bet,win:response.outcome.win,balance:response.balance.wallet+response.balance.game};
  }
 }
 if(result?.transport==='ws'&&balances.length)result.balance=balances.at(-1);
 return result;
}
