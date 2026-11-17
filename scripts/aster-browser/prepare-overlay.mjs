import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
const [sourceInput,productInput]=process.argv.slice(2);assert.ok(sourceInput&&productInput);
const source=resolve(sourceInput),product=resolve(productInput);assert.notEqual(source,product);
const git=(cwd,...args)=>execFileSync('git',['-C',cwd,...args],{encoding:'utf8'}).trim();
assert.equal(git(source,'rev-parse','HEAD'),process.env.GITHUB_WORKFLOW_SHA);
assert.equal(git(product,'rev-parse','HEAD'),'5d352aaf354b6098b0a2ad4283b4ba48d76f9ad7');
assert.equal(git(product,'rev-parse','--abbrev-ref','HEAD'),'HEAD');assert.equal(git(product,'status','--porcelain'),'');
const paths=JSON.parse(git(source,'show','HEAD:scripts/aster-browser/overlay-files.json'));
for(const path of paths){
 assert.match(path,/^scripts\/(aster-browser|private-runtime-recipe)\/[a-zA-Z0-9_.-]+$/);
 const bytes=execFileSync('git',['-C',source,'show',`HEAD:${path}`]);
 mkdirSync(dirname(join(product,path)),{recursive:true});writeFileSync(join(product,path),bytes);
}
console.log(JSON.stringify({productSha:git(product,'rev-parse','HEAD'),workflowSha:git(source,'rev-parse','HEAD'),overlayFiles:paths.length}));
