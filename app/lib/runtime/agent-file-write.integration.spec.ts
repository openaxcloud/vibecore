import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildWorkspaceAgentApp } from '@vibecore/workspace-agent/src/app';
import { signAgentToken } from '@vibecore/workspace-sdk';
import { expect, it } from 'vitest';
import { confirmAcceptedAgentFile, writeAcceptedAgentFile } from './agent-file-write';
import {
  cheminsEcritsParLesLanes,
  confirmerEcritureDeMessage,
  observerEcrituresDeMessage,
  reinitialiserConfirmationsEcriture,
} from './agent-lane-writes';
import { reconcileRemoteWrite } from '~/lib/stores/reconcile-remote-write';

it('writes complete JSONC options through the real agent and confirms disk bytes; never repairs a concurrent mismatch by writing again', async () => {
  const root = await mkdtemp(join(tmpdir(), 'patch-confirmation-'));
  const workspaceId = 'isolated-confirmation';
  const tokenSecret = 'local-test-only';
  const app = buildWorkspaceAgentApp({ workspaceRoot: root, workspaceId, tokenSecret });

  const headers = {
    authorization: `Bearer ${signAgentToken({ workspaceId, secret: tokenSecret, expiresAt: Date.now() + 60_000 })}`,
  };

  let writes = 0;

  const runtime = {
    createDirectory: async () => undefined,
    writeFile: async (path: string, content: string) => {
      const response = await app.inject({ method: 'POST', url: '/files/write', headers, payload: { path, content } });
      expect(response.statusCode).toBe(200);
      writes++;
    },
    readFile: async (path: string) => {
      const response = await app.inject({
        method: 'GET',
        url: `/files/read?path=${encodeURIComponent(path)}`,
        headers,
      });
      expect(response.statusCode).toBe(200);

      return response.json<{ content: string; encoding: 'utf8' }>();
    },
  };

  const stub = '{"compilerOptions":{"target":"ES2020","noEmit":true}}';

  const proposed = `{
    "compilerOptions": {
      "target": "ES2020",
      /* Bundler mode */ "moduleResolution": "bundler", "jsx": "react-jsx",
      // Linting
      "strict": true,
      /* Path Aliases */ "paths": { "@/*": ["./src/*"], },
    },
  }`;

  try {
    reinitialiserConfirmationsEcriture();
    observerEcrituresDeMessage('isolated-real-agent');
    await writeFile(join(root, 'tsconfig.json'), stub);

    const merged = reconcileRemoteWrite('tsconfig.json', stub, proposed);
    const written = await writeAcceptedAgentFile(runtime, 'tsconfig.json', merged);
    expect(cheminsEcritsParLesLanes('isolated-real-agent')).toEqual([]);

    const confirmed = await confirmAcceptedAgentFile(runtime, 'tsconfig.json', written);
    expect(confirmed).toBe(true);

    if (confirmed) {
      confirmerEcritureDeMessage('isolated-real-agent', 'tsconfig.json', 'real-agent-proposal');
    }

    expect(cheminsEcritsParLesLanes('isolated-real-agent')).toEqual(['tsconfig.json']);

    const disk = await readFile(join(root, 'tsconfig.json'), 'utf8');
    expect(disk).toBe(written);
    expect(JSON.parse(disk).compilerOptions).toEqual({
      target: 'ES2020',
      noEmit: true,
      moduleResolution: 'bundler',
      jsx: 'react-jsx',
      strict: true,
      paths: { '@/*': ['./src/*'] },
    });
    await writeFile(join(root, 'tsconfig.json'), 'concurrent user content');
    await expect(confirmAcceptedAgentFile(runtime, 'tsconfig.json', written)).resolves.toBe(false);
    expect(await readFile(join(root, 'tsconfig.json'), 'utf8')).toBe('concurrent user content');
    expect(writes).toBe(1);
  } finally {
    reinitialiserConfirmationsEcriture();
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});
