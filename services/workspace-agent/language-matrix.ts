// Run in a disposable workspace with: pnpm --filter @vibecore/workspace-agent exec tsx language-matrix.ts
import assert from 'node:assert/strict';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { signAgentToken } from '@vibecore/workspace-sdk';
import { buildWorkspaceAgentApp } from './src/app.js';

const projects = [
  { language: 'Python', path: 'main.py', content: 'print(6 * 7)', command: 'python3 main.py' },
  { language: 'Node', path: 'main.mjs', content: 'console.log(6 * 7)', command: 'node main.mjs' },
  {
    language: 'Go',
    path: 'main.go',
    content: 'package main\nimport "fmt"\nfunc main(){fmt.Println(6 * 7)}',
    command: 'go run main.go',
  },
  {
    language: 'Rust',
    path: 'main.rs',
    content: 'fn main(){println!("{}", 6 * 7);}',
    command: 'rustc main.rs -o main && ./main',
  },
];

for (const project of projects) {
  const root = await mkdtemp(join(tmpdir(), 'workspace-matrix-'));
  const workspaceId = randomUUID();
  const tokenSecret = randomUUID();
  const started = performance.now();
  const agent = buildWorkspaceAgentApp({ workspaceRoot: root, workspaceId, tokenSecret, commandTimeoutMs: 60000 });
  try {
    const url = await agent.listen({ host: '127.0.0.1', port: 0 });
    const token = signAgentToken({ workspaceId, secret: tokenSecret, expiresAt: Date.now() + 90000 });
    async function post(path: string, payload: unknown) {
      const response = await fetch(url + path, {
        method: 'POST',
        headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      assert.equal(response.status, 200, path + ' returned ' + response.status);
      return response.json();
    }
    const readyMs = Math.round(performance.now() - started);
    await post('/files/write', { path: project.path, content: project.content });
    const launched = performance.now();
    const result = z
      .object({ code: z.number().nullable(), stdout: z.string(), stderr: z.string() })
      .parse(await post('/commands/run', { command: 'sh', args: ['-c', project.command] }));
    const runMs = Math.round(performance.now() - launched);
    const passed = result.code === 0 && result.stdout === '42\n';
    console.log(
      JSON.stringify({
        language: project.language,
        readyMs,
        runMs,
        code: result.code,
        stdout: result.stdout,
        stderr: result.stderr,
        passed,
      }),
    );
    if (!passed) process.exitCode = 1;
  } catch (error) {
    console.error(project.language, error);
    process.exitCode = 1;
  } finally {
    await agent.close();
    await rm(root, { recursive: true, force: true });
  }
}
