import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { signAgentToken } from '@vibecore/workspace-sdk';
import { expect, it } from 'vitest';
import { z } from 'zod';

const require = createRequire(import.meta.url);
const secret = 'synthetic-test-secret';
const workspaceId = 'isolated-agent-restart';

async function freePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  const port = (server.address() as { port: number }).port;
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));

  return port;
}

async function stop(child: ChildProcess, signal: NodeJS.Signals) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  const closed = once(child, 'close');
  child.kill(signal);
  await closed;
  expect(child.signalCode).toBe(signal);
}

it('boots the real agent entrypoint, preserves files across stop/crash, and runs commands after restart', async () => {
  const root = await mkdtemp(join(tmpdir(), 'agent-restart-proof-'));
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const children: ChildProcess[] = [];

  const headers = {
    authorization: `Bearer ${signAgentToken({ workspaceId, expiresAt: Date.now() + 120_000, secret })}`,
    'content-type': 'application/json',
  };
  const boot = async () => {
    const child = spawn(
      process.execPath,
      ['--import', require.resolve('tsx'), fileURLToPath(new URL('./server.ts', import.meta.url))],
      {
        cwd: root,
        env: {
          PATH: process.env.PATH,
          HOME: root,
          TMPDIR: root,
          NODE_ENV: 'test',
          HOST: '127.0.0.1',
          PORT: String(port),
          WORKSPACE_ROOT: root,
          WORKSPACE_ID: workspaceId,
          WORKSPACE_AGENT_TOKEN_SECRET: secret,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    children.push(child);

    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    await expect
      .poll(
        async () => {
          if (child.exitCode !== null) {
            throw new Error(`Agent exited ${child.exitCode}: ${stderr}`);
          }

          try {
            const response = await fetch(`${base}/health`, { signal: AbortSignal.timeout(500) });
            return (
              response.ok && z.object({ workspaceRoot: z.string() }).parse(await response.json()).workspaceRoot === root
            );
          } catch {
            return false;
          }
        },
        { timeout: 10_000 },
      )
      .toBe(true);

    return child;
  };
  const command = async (script: string) => {
    const response = await fetch(`${base}/commands/run`, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(5_000),
      body: JSON.stringify({ command: process.execPath, args: ['-e', script] }),
    });
    expect(response.status).toBe(200);

    return z.object({ code: z.number(), stdout: z.string() }).parse(await response.json());
  };

  try {
    const first = await boot();
    expect((await fetch(`${base}/files/read?path=proof.txt`)).status).toBe(401);

    const created = await fetch(`${base}/files/create`, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(5_000),
      body: JSON.stringify({ path: 'proof.txt', content: 'persisted-é-✓' }),
    });
    expect(created.status).toBe(200);
    expect(await readFile(join(root, 'proof.txt'), 'utf8')).toBe('persisted-é-✓');
    await stop(first, 'SIGTERM');
    await expect(fetch(`${base}/health`, { signal: AbortSignal.timeout(500) })).rejects.toThrow();

    const second = await boot();
    const read = await fetch(`${base}/files/read?path=proof.txt`, { headers });
    expect(read.status).toBe(200);
    expect(await read.json()).toMatchObject({ content: 'persisted-é-✓' });
    expect((await command('process.exit(17)')).code).toBe(17);
    expect((await command('console.log("after-command-failure")')).code).toBe(0);
    await stop(second, 'SIGKILL');

    await boot();

    const result = await command('console.log(require("node:fs").readFileSync("proof.txt", "utf8"))');
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('persisted-é-✓');
  } finally {
    for (const child of children) {
      await stop(child, 'SIGKILL');
    }
    await rm(root, { recursive: true, force: true });
  }
}, 45_000);
