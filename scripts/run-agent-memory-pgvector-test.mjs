#!/usr/bin/env node
import { spawn } from 'node:child_process';

const image = process.env.AGENT_MEMORY_PGVECTOR_IMAGE ?? 'pgvector/pgvector:pg16';
const containerName = `vibecore-agent-memory-pgvector-${process.pid}-${Date.now()}`;
const postgresUser = 'vibecore';
const postgresPassword = 'vibecore';
const postgresDb = 'vibecore_agent_memory_test';

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: options.stdio ?? 'pipe',
      env: options.env ?? process.env,
    });
    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk) => {
      stdout += chunk;
      if (options.echo) {
        process.stdout.write(chunk);
      }
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk;
      if (options.echo) {
        process.stderr.write(chunk);
      }
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`${command} ${args.join(' ')} failed with exit code ${code}\n${stderr.trim()}`));
      }
    });
  });
}

async function waitForPostgres() {
  const startedAt = Date.now();
  const timeoutMs = 60_000;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      await run('docker', ['exec', containerName, 'pg_isready', '-U', postgresUser, '-d', postgresDb]);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  throw new Error('Timed out waiting for pgvector PostgreSQL container to become ready');
}

async function main() {
  console.log(`Starting ${image} for real pgvector/HNSW integration test...`);
  await run('docker', [
    'run',
    '--rm',
    '-d',
    '--name',
    containerName,
    '-e',
    `POSTGRES_USER=${postgresUser}`,
    '-e',
    `POSTGRES_PASSWORD=${postgresPassword}`,
    '-e',
    `POSTGRES_DB=${postgresDb}`,
    '-p',
    '127.0.0.1::5432',
    image,
  ]);

  try {
    await waitForPostgres();
    const port = await run('docker', ['port', containerName, '5432/tcp']);
    const hostPort = port.split(':').at(-1);

    if (!hostPort) {
      throw new Error(`Unable to read mapped PostgreSQL port from docker output: ${port}`);
    }

    const databaseUrl = `postgresql://${postgresUser}:${postgresPassword}@127.0.0.1:${hostPort}/${postgresDb}`;

    await run(
      'pnpm',
      ['vitest', 'run', 'services/api/src/tests/agent-memory-pgvector.integration.spec.ts'],
      {
        stdio: 'inherit',
        env: {
          ...process.env,
          AGENT_MEMORY_PGVECTOR_TEST_DATABASE_URL: databaseUrl,
        },
      },
    );
  } finally {
    await run('docker', ['rm', '-f', containerName]).catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
