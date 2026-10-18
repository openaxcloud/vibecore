/** Opt-in local Docker proof. Uses an already cached image; no pull, provider, or existing database. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createConnection, createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { parse, stringify } from 'yaml';
import { cleanup, createScope, docker, start } from './ci-local-dependencies.mjs';

const image = process.argv[2];
assert(image?.startsWith('pgvector/pgvector@sha256:'), 'Pass the already cached pgvector image digest');

const endpoint =
  process.env.DOCKER_HOST ||
  execFileSync('docker', ['context', 'inspect', '--format', '{{(index .Endpoints "docker").Host}}'], {
    encoding: 'utf8',
  }).trim();
assert(endpoint.startsWith('unix://'), 'Only the local Unix Docker socket is allowed');
execFileSync('docker', ['image', 'inspect', '--format', '{{.Id}}', image], { stdio: ['ignore', 'pipe', 'inherit'] });

const directory = await mkdtemp(join(tmpdir(), 'vibecore-ci-ports-docker-'));
const scopes = [];
const clients = [];
const witness = createServer((socket) => socket.end('owned-port-witness'));

const proof = {
  fixedPortRejected: false,
  distinctPorts: [],
  independentDatabases: false,
  witnessSurvived: false,
  resourcesRemoved: false,
};

async function witnessReply() {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: '127.0.0.1', port: 55432 });

    let reply = '';
    socket.on('data', (data) => {
      reply += data;
    });
    socket.on('end', () => resolve(reply));
    socket.on('error', reject);
    socket.setTimeout(5000, () => socket.destroy(new Error('Witness timed out')));
  });
}

try {
  await new Promise((resolve, reject) => {
    witness.once('error', reject);
    witness.listen(55432, '127.0.0.1', resolve);
  });
  assert.equal(await witnessReply(), 'owned-port-witness');

  const base = parse(await readFile(new URL('../docker-compose.dev.yml', import.meta.url), 'utf8'));

  const compose = {
    services: { postgres: { ...base.services.postgres, image, pull_policy: 'never' } },
    volumes: base.volumes,
  };

  const fixed = join(directory, 'fixed.yml');
  const dynamic = join(directory, 'dynamic.yml');
  await writeFile(dynamic, stringify(compose));
  await writeFile(
    fixed,
    stringify({ ...compose, services: { postgres: { ...compose.services.postgres, ports: ['55432:5432'] } } }),
  );

  const legacy = await createScope({
    temporaryDirectory: directory,
    composeFile: fixed,
    selectedServices: ['postgres'],
  });
  scopes.push(legacy);
  await assert.rejects(
    start(legacy),
    (error) =>
      /55432/.test(error.cause?.stderr ?? '') &&
      /address already in use|port is already allocated/.test(error.cause?.stderr ?? ''),
  );
  proof.fixedPortRejected = true;
  await cleanup(legacy);

  for (let index = 0; index < 2; index++) {
    const scope = await createScope({
      temporaryDirectory: directory,
      composeFile: dynamic,
      selectedServices: ['postgres'],
    });
    scopes.push(scope);

    const environment = await start(scope);
    proof.distinctPorts.push(Number(environment.POSTGRES_PORT));

    const client = new pg.Client({ connectionString: environment.DATABASE_URL, connectionTimeoutMillis: 5000 });
    clients.push(client);
    await client.connect();
    assert.equal(
      (await client.query("SELECT to_regclass('public.port_isolation_probe') AS existing")).rows[0].existing,
      null,
    );
    await client.query('CREATE TABLE port_isolation_probe (marker text NOT NULL)');
    await client.query('INSERT INTO port_isolation_probe VALUES ($1)', [scope.project]);
  }
  assert.equal(new Set(proof.distinctPorts).size, 2);
  assert(!proof.distinctPorts.includes(55432));
  proof.independentDatabases = true;
  await clients[0].end();
  await cleanup(scopes[1]);
  assert.equal((await clients[1].query('SELECT marker FROM port_isolation_probe')).rows[0].marker, scopes[2].project);
  assert.equal(await witnessReply(), 'owned-port-witness');
  await clients[1].end();
  await cleanup(scopes[2]);
  assert.equal(await witnessReply(), 'owned-port-witness');
  proof.witnessSurvived = true;

  for (const scope of scopes) {
    for (const command of [
      ['ps', '-aq'],
      ['volume', 'ls', '-q'],
      ['network', 'ls', '-q'],
    ]) {
      assert.equal(
        (
          await docker(scope, [...command, '--filter', `label=com.docker.compose.project=${scope.project}`], {
            capture: true,
          })
        ).trim(),
        '',
      );
    }
  }
  proof.resourcesRemoved = true;
  console.log(JSON.stringify(proof, null, 2));
} finally {
  for (const client of clients) {
    await client.end().catch((error) => console.error(error.message));
  }

  const results = await Promise.allSettled(scopes.map((scope) => cleanup(scope)));
  await new Promise((resolve) => witness.close(resolve));

  const failures = results.filter((result) => result.status === 'rejected');

  if (failures.length) {
    throw new AggregateError(
      failures.map((failure) => failure.reason),
      `Cleanup incomplete; ownership records retained in ${directory}`,
    );
  }

  await rm(directory, { recursive: true, force: true });
}
