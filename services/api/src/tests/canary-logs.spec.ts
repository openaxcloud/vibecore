import { describe, expect, it } from 'vitest';
import { buildApiApp } from '../app.js';
import { TestApiStore } from './test-api-store.js';

const CANARY = 'canary_xK9pT4mZqQwR8aLnY3vU7sBcD2';

class TestGitProvider {
  importRepository = async () => ({ defaultBranch: 'main' });
  cloneRepository = async () => ({ defaultBranch: 'main' });
  commit = async () => ({ sha: 'sha' });
  push = async () => ({});
  pull = async () => ({});
  branches = async () => [];
  checkout = async () => ({});
  diff = async () => '';
  createPullRequest = async () => ({ number: 1, url: 'https://example.com/pr/1' });
}

class TestEmailProvider {
  send = async () => ({ messageId: 'test' });
}

function captureStream() {
  const lines: string[] = [];
  return {
    lines,
    stream: {
      write(line: string) {
        lines.push(line);
      },
    },
  };
}

describe('canary secret never appears in API logs', () => {
  it('redacts canary values from request bodies, headers, cookies', async () => {
    const capture = captureStream();
    const app = await buildApiApp({
      store: new TestApiStore(),
      gitProvider: new TestGitProvider() as any,
      emailProvider: new TestEmailProvider() as any,
      loggerStream: capture.stream,
    });

    await app.inject({
      method: 'POST',
      url: '/auth/register',
      headers: {
        authorization: `Bearer ${CANARY}`,
        cookie: `session=${CANARY}`,
        'x-real-ip': '127.0.0.1',
      },
      payload: {
        email: 'canary@example.com',
        password: CANARY,
        name: 'Canary User',
        organizationName: 'Canary Org',
      },
    });

    await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'canary@example.com', password: CANARY },
    });

    await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'wrong@example.com', password: CANARY },
    });

    const captured = capture.lines.join('\n');
    expect(captured.length).toBeGreaterThan(0);
    expect(captured).not.toContain(CANARY);

    await app.close();
  });
});
