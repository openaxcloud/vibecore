/** Exact former compiled-probe start function, retained solely for leak regression reproduction. */
export function oldStartFactory(spawn,relaySafe,emitDiagnostic,stage,children){
 function start(command,args,env,limit) {
  const childStage=stage;
  const child=spawn(command,args,{env,stdio:['ignore','pipe','ignore']});children.push(child);
  let output='';let settled=false;let killTimer;
  const relay=relaySafe();
  const timer=setTimeout(()=>{emitDiagnostic(childStage,'failed','timeout');child.kill('SIGTERM');killTimer=setTimeout(()=>child.kill('SIGKILL'),2000);},limit);
  const done=new Promise(resolve=>{
   child.stdout.on('data',b=>{relay(b);if(output.length<16384)output+=b.toString();});
   child.on('error',()=>{settled=true;clearTimeout(timer);clearTimeout(killTimer);resolve(-1);});
   child.on('close',code=>{settled=true;clearTimeout(timer);clearTimeout(killTimer);resolve(code);});
  });return {child,done,output:()=>output,alive:()=>!settled};
 }
return start;
}
