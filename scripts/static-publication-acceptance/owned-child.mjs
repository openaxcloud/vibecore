import {spawn} from 'node:child_process';
const waitWithin=(promise,ms)=>{let timer;return Promise.race([promise,new Promise(resolve=>{timer=setTimeout(resolve,ms);})]).finally(()=>clearTimeout(timer));};
/** Own the complete Linux process group, including pnpm -> server grandchildren. */
export function ownedChild(command,args,env,limit,{onData=()=>{},onTimeout=()=>{}}={}){
 const child=spawn(command,args,{env,stdio:['ignore','pipe','ignore'],detached:true});
 let settled=false,ending=false,timer;let resolveDone,resolveClosed;
 const closed=new Promise(resolve=>{resolveClosed=resolve;});const done=new Promise(resolve=>{resolveDone=resolve;});
 const signal=name=>{if(Number.isInteger(child.pid)&&child.pid>0){try{process.kill(-child.pid,name);}catch{}}};
 const finish=async code=>{if(ending)return;ending=true;clearTimeout(timer);signal('SIGTERM');await waitWithin(closed,250);signal('SIGKILL');await waitWithin(closed,250);child.stdout?.destroy();child.unref();settled=true;resolveDone(code);};
 child.stdout.on('data',onData);
 child.once('close',()=>resolveClosed());child.once('exit',code=>void finish(code??-1));child.once('error',()=>void finish(-1));
 timer=setTimeout(()=>{onTimeout();void finish(-1);},limit);
 return {child,done,alive:()=>!settled&&!ending,stop:async()=>{void finish(-1);await done;}};
}
