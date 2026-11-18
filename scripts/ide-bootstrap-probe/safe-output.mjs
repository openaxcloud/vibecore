import {diagnostic} from './diagnostics.mjs';
import {safeObservation} from './ide-entry-observation.mjs';
export function terminal(v){return v&&Object.keys(v).sort().join(',')==='stage,status'&&v.stage==='ide-entry-probe'&&v.status==='observed'?{stage:'ide-entry-probe',status:'observed'}:null;}
export function relaySafe(write=v=>console.log(JSON.stringify(v))){let line='',discard=false,count=0;return chunk=>{for(const c of chunk.toString()){if(c==='\n'){if(!discard&&count<192){try{const v=JSON.parse(line),safe=diagnostic(v)||safeObservation(v)||terminal(v);if(safe){count++;write(safe);}}catch{}}line='';discard=false;}else if(!discard){line+=c;if(line.length>512){line='';discard=true;}}}};}
