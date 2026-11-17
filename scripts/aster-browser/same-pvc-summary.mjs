import {readFileSync,appendFileSync} from 'node:fs';
let evidence=false;
try {
 const r=JSON.parse(readFileSync('private-runtime-evidence/result.json','utf8'));
 evidence=r.ok===true&&r.scope==='authenticated-browser-same-pvc-reseed'&&r.volumeReplacement==='same-pvc-new-pod'&&r.podBytes==='canonical-and-orphan-witnesses-checked'&&r.sourceAttestation?.productSha==='5d352aaf354b6098b0a2ad4283b4ba48d76f9ad7'&&r.sourceAttestation?.workflowSha===process.env.GITHUB_WORKFLOW_SHA;
} catch { /* Absent proof cannot pass. */ }
const passed=process.env.RECIPE_OUTCOME==='success'&&process.env.CLEANUP_OUTCOME==='success'&&evidence;
const outcome=passed?'PASS: same-PVC selective reseed regression verified':'NOT VERIFIED: failed, cancelled, skipped, or incomplete evidence';
const text=`## Vibecore #932 isolated regression\n${outcome}\n\n${passed?'Canonical file kept intact on browser reopen.':'Canonical preservation was not verified.'} No durable-manifest or fresh-volume claim. No production deployment.\n`;
console.log(text);if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,text);if(!passed)process.exitCode=1;
