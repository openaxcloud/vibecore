import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync,lstatSync,existsSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {assertSource,reviewedOverlay,productSha,attestProbeSources} from './source-attestation.mjs';
const source=assertSource();const product=resolve(process.argv[2]);assert.notEqual(source,product);
assert.equal(execFileSync('git',['-C',product,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),productSha);
assert.equal(execFileSync('git',['-C',product,'status','--porcelain'],{encoding:'utf8'}).trim(),'');
for(const path of reviewedOverlay){
 assert.match(path,/^scripts\/(ide-bootstrap-probe|private-runtime-recipe)\/[a-zA-Z0-9_.-]+$/);
 const dest=join(product,path);if(existsSync(dest))assert.ok(lstatSync(dest).isFile()&&!lstatSync(dest).isSymbolicLink());
 mkdirSync(dirname(dest),{recursive:true});writeFileSync(dest,execFileSync('git',['-C',source,'show',`HEAD:${path}`]));
}
attestProbeSources(process.env,product);console.log(JSON.stringify({stage:'source-overlay',status:'verified'}));
