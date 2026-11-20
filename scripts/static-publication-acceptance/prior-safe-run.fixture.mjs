/** No raw child stdout/stderr is relayed to Actions. Only final fixed statuses. */
import {spawn} from 'node:child_process';
const args=process.argv.slice(2);const expectProof=args[0]==='--expect-publication';if(expectProof)args.shift();
if(!args.length)process.exit(2);
const child=spawn(args[0],args.slice(1),{stdio:['ignore','pipe','ignore'],detached:true});
let buffer='',proof=false;
child.stdout.on('data',chunk=>{
 buffer+=chunk.toString();if(buffer.length>65536)buffer=buffer.slice(-65536);
 let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);
  try{const v=JSON.parse(line);if(v.stage==='anonymous-static-versions'&&v.status==='verified'&&v.versions===2)proof=true;}catch{}
 }
});
const stop=()=>{try{process.kill(-child.pid,'SIGTERM');}catch{};setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}},5000).unref();};
process.on('SIGTERM',stop);process.on('SIGINT',stop);
child.on('error',()=>{console.log('{"stage":"bounded-command","status":"failed"}');process.exitCode=1;});
child.on('close',code=>{const ok=code===0&&(!expectProof||proof);console.log(JSON.stringify({stage:expectProof?'static-publication-acceptance':'bounded-command',status:ok?(expectProof?'verified':'completed'):'failed'}));process.exitCode=ok?0:1;});
