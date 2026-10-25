import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const require = createRequire(join(process.cwd(), 'package.json'));
const JSZip = require('jszip');
const api = process.env.QA_API_BASE_URL ?? 'http://127.0.0.1:3016';
assert(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(api).hostname), 'Only loopback API allowed');
let token;
const checks = [];
async function call(path, body) {
  const r = await fetch(api + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await r.json();
  assert(r.ok, `${path} HTTP ${r.status}`);
  return data;
}
const marker = `api-git-${Date.now()}`;
const user = await call('/auth/register', {
  email: marker + '@local.test',
  password: 'Password123!',
  name: 'Local API proof',
});
token = user.token;
const { project } = await call(`/orgs/${user.organization.id}/projects`, { name: marker });
const path = `/projects/${project.id}`;
const zip = new JSZip();
zip.file('proof.txt', marker + '\n');
await call(path + '/files/import/zip', { zipBase64: await zip.generateAsync({ type: 'base64' }) });
const before = await call(path + '/git/status');
assert(before.status.changedFiles.includes('proof.txt'));
checks.push('real ZIP import visible in git status');
const { commit } = await call(path + '/git/commit', { message: marker });
assert(commit.sha);
const graph = await call(path + '/git/graph');
assert(graph.commits.some((c) => c.sha === commit.sha));
checks.push('real commit SHA appears in graph');
await call(path + '/git/branches/checkout', { branch: 'qa-isolated', create: true });
const branches = await call(path + '/git/branches');
assert(JSON.stringify(branches).includes('qa-isolated'));
checks.push('real branch creation and listing');
const zip2 = new JSZip();
zip2.file('proof.txt', marker + '\nsecond line\n');
await call(path + '/files/import/zip', { zipBase64: await zip2.generateAsync({ type: 'base64' }) });
const diff = await call(path + '/git/diff?filePath=proof.txt');
assert(JSON.stringify(diff).includes('second line'));
checks.push('real file diff shows added content');
await writeFile(
  process.env.QA_RECEIPT_PATH ?? '/tmp/git-deploy-api-proof.json',
  JSON.stringify(
    {
      scope: 'isolated local API PostgreSQL Git, synthetic fixture',
      checks,
      commitSha: commit.sha,
      notExecuted: ['external push/pull', 'publication', 'DNS', 'production'],
    },
    null,
    2,
  ),
);
console.log(checks.join('\n'));
