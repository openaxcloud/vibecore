import {spawn} from 'node:child_process';
import {relaySafe,terminal} from './safe-output.mjs';
const args=process.argv.slice(2),expect=args[0]==='--expect-observation';if(expect)args.shift();if(!args.length)process.exit(2);
let proof=false;const relay=relaySafe(v=>{if(terminal(v))proof=true;else console.log(JSON.stringify(v));});
const child=spawn(args[0],args.slice(1),{stdio:['ignore','pipe','ignore'],detached:true});child.stdout.on('data',relay);
const stop=()=>{try{process.kill(-child.pid,'SIGTERM');}catch{}setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}},5000).unref();};process.on('SIGTERM',stop);process.on('SIGINT',stop);
child.on('error',()=>{console.log('{"stage":"bounded-command","status":"failed"}');process.exitCode=1;});
child.on('close',code=>{const ok=code===0&&(!expect||proof);console.log(JSON.stringify({stage:expect?'ide-entry-probe':'bounded-command',status:ok?(expect?'observed':'completed'):'failed'}));process.exitCode=ok?0:1;});
