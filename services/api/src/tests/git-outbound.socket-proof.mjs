import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, request } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { GitCliProvider } = createRequire(import.meta.url)('./git-provider-proof.cjs');
const directory = mkdtempSync(join(tmpdir(), 'vibecore-git-native-'));
const working = join(directory, 'working');
const repos = join(directory, 'repos');
const hostname = `vibecore-git-${process.pid}.test`;
const hosts = readFileSync('/etc/hosts', 'utf8');
appendFileSync('/etc/hosts', `\n127.0.0.1 ${hostname}\n`);

const git = (args, options = {}) =>
  execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options });
git(['init', '--initial-branch=main', working]);
git(['config', 'user.name', 'Isolated fixture'], { cwd: working });
git(['config', 'user.email', 'fixture@example.test'], { cwd: working });
writeFileSync(join(working, 'README.md'), '# Real isolated repository\n');
git(['add', '.'], { cwd: working });
git(['commit', '-m', 'Fixture commit'], { cwd: working });
git(['clone', '--bare', working, join(repos, 'repo.git')]);
process.env.PROJECT_STORAGE_DIR = join(directory, 'imports');

let publicHits = 0;
let privateHits = 0;

const publicServer = createServer((req, res) => {
  publicHits++;

  const url = new URL(req.url, `http://${hostname}`);

  if (url.pathname.startsWith('/redirect.git')) {
    res.writeHead(302, { location: `http://127.0.0.1:${port}/private` });
    res.end();

    return;
  }

  const child = spawn('git', ['http-backend'], {
    env: {
      ...process.env,
      GIT_PROJECT_ROOT: repos,
      GIT_HTTP_EXPORT_ALL: '1',
      REQUEST_METHOD: req.method,
      PATH_INFO: url.pathname,
      QUERY_STRING: url.search.slice(1),
      CONTENT_TYPE: req.headers['content-type'] ?? '',
      CONTENT_LENGTH: req.headers['content-length'] ?? '',
    },
  });
  req.pipe(child.stdin);

  const chunks = [];
  child.stdout.on('data', (chunk) => chunks.push(chunk));
  child.on('close', () => {
    const output = Buffer.concat(chunks);
    const boundary = output.indexOf('\r\n\r\n');
    assert.ok(boundary >= 0);

    const headers = {};

    let status = 200;

    for (const line of output.subarray(0, boundary).toString().split('\r\n')) {
      const [name, ...value] = line.split(':');

      if (name.toLowerCase() === 'status') {
        status = parseInt(value.join(':').trim(), 10);
      } else {
        headers[name] = value.join(':').trim();
      }
    }

    res.writeHead(status, headers);
    res.end(output.subarray(boundary + 4));
  });
});
publicServer.listen(0, '93.184.216.34');
await once(publicServer, 'listening');

const port = publicServer.address().port;

const privateServer = createServer((_req, res) => {
  privateHits++;
  res.end('private endpoint');
});
privateServer.listen(port, '127.0.0.1');
await once(privateServer, 'listening');

try {
  await new Promise((resolve, reject) => {
    request(`http://${hostname}:${port}/private`, (response) => {
      response.resume();
      response.on('end', resolve);
    })
      .on('error', reject)
      .end();
  });
  assert.equal(privateHits, 1);
  privateHits = 0;

  let resolutions = 0;

  const provider = new GitCliProvider({
    resolveHost: async () => {
      resolutions++;
      return ['93.184.216.34'];
    },
  });

  const result = await provider.importRepository({ repositoryUrl: `http://${hostname}:${port}/repo.git` });
  assert.equal(result.defaultBranch, 'main');
  assert.ok(result.files.some((file) => file.path === 'README.md'));
  assert.ok(publicHits >= 2);
  assert.equal(privateHits, 0);
  assert.equal(resolutions, 1);
  await assert.rejects(provider.importRepository({ repositoryUrl: `http://${hostname}:${port}/redirect.git` }));
  assert.equal(privateHits, 0);
  console.log(JSON.stringify({ realClone: true, publicHits, privateHits, directPrivateWitness: 1, resolutions }));
} finally {
  console.error(JSON.stringify({ fixturePublicHits: publicHits, fixturePrivateHits: privateHits }));
  await Promise.all([
    new Promise((resolve) => publicServer.close(resolve)),
    new Promise((resolve) => privateServer.close(resolve)),
  ]);
  writeFileSync('/etc/hosts', hosts);
  rmSync(directory, { recursive: true, force: true });
}
