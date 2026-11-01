import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
const f=JSON.parse(await readFile('/workspace/ui-database-form-20261101/fixture-private.json','utf8'));
assert.equal(f.origin,'http://127.0.0.1:8787');
const cases=[];
for(const [expression,expected] of [["'own proto'::text",'own proto'],["'{\"marker\":\"own json\"}'::jsonb",{marker:'own json'}],['NULL::text',null]]){
 const response=await fetch(`${f.origin}/projects/${encodeURIComponent(f.projectId)}/databases/query`,{method:'POST',headers:{authorization:`Bearer ${f.token}`,'content-type':'application/json'},body:JSON.stringify({key:'DATABASE_URL',query:`SELECT 0 AS earlier; SELECT ${expression} AS "__proto__", 'own constructor'::text AS "constructor", 'own prototype'::text AS "prototype", 900719925474099312345.000001::numeric AS amount, 9007199254740993::bigint AS big, FALSE AS enabled, ARRAY[1,2]::int[] AS numbers, '2026-11-01T12:34:56+02:00'::timestamptz AS at;`})});
 assert.equal(response.status,200);const {result}=await response.json();const row=result.rows[0];
 assert.equal(result.command,'SELECT');assert.equal(result.rowCount,1);assert.ok(Object.hasOwn(row,'__proto__'));assert.deepEqual(row.__proto__,expected);assert.equal(row.constructor,'own constructor');assert.equal(row.prototype,'own prototype');assert.equal(row.amount,'900719925474099312345.000001');assert.equal(row.big,'9007199254740993');assert.equal(row.enabled,false);assert.deepEqual(row.numbers,[1,2]);assert.equal(row.at,'2026-11-01T10:34:56.000Z');assert.equal(Object.getPrototypeOf(row),Object.prototype);assert.equal(Object.hasOwn(Object.prototype,'marker'),false);
 cases.push({kind:expected===null?'null':typeof expected,status:response.status,passed:true,columns:result.columns});
}
const receipt={realHttp:true,realPostgres:true,authMetadata:'synthetic TestApiStore',production:false,cases};await writeFile('/workspace/ui-pg-row-parser-20261101/http-receipt.json',JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
