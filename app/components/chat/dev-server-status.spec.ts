import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';

import { devServerStatusText } from './dev-server-status';

/*
 * BUG-UX-DEV-BLOCKED-STUCK (live 24/08): after several project reopenings the
 * status bar froze on "Dev: blocked / No port" while the workspace was in fact
 * coming back — a transient failure had latched previewServerState on 'error'
 * and the aggregate `ready` (vetoed by the lagging manager status / stale
 * client beacon) kept every port at false, so nothing ever unlatched it.
 */

const t = ((key: string, params?: Record<string, unknown>) =>
  params ? `${key} ${JSON.stringify(params)}` : key) as unknown as TFunction;

const base = {
  workspaceLoading: false,
  logs: [] as string[],
};

describe('devServerStatusText', () => {
  it('a SERVING port resolves a latched error state to "Dev: active" (ready still false)', () => {
    const label = devServerStatusText(t, {
      ...base,
      previews: [{ ready: false, serving: true }],
      previewServerState: { status: 'error', error: 'Command stream closed before completion' },
    });

    expect(label).toContain('baseChatAst.dev.active');
  });

  it('AVANT/regression guard: a not-ready, not-serving port with a latched error still reads blocked', () => {
    const label = devServerStatusText(t, {
      ...base,
      previews: [{ ready: false }],
      previewServerState: { status: 'error', error: '' },
    });

    expect(label).toBe('baseChatAst.dev.blocked');
  });

  it('a genuine runtime failure with no live port surfaces its REASON instead of a bare frozen "blocked"', () => {
    const label = devServerStatusText(t, {
      ...base,
      previews: [],
      previewServerState: { status: 'error', error: 'npm run dev exited with code 127' },
    });

    expect(label).toContain('baseChatAst.dev.blockedReason');
    expect(label).toContain('npm run dev exited with code 127');
  });

  it('truncates a long failure reason (the full message stays in the logs)', () => {
    const label = devServerStatusText(t, {
      ...base,
      previews: [],
      previewServerState: { status: 'error', error: 'x'.repeat(200) },
    });

    expect(label).toContain('…');
    expect(label.length).toBeLessThan(150);
  });

  it('a ready port still reads active (unchanged happy path)', () => {
    const label = devServerStatusText(t, {
      ...base,
      previews: [{ ready: true }],
      previewServerState: { status: 'running' },
    });

    expect(label).toBe('baseChatAst.dev.active');
  });

  it('starting state is unchanged', () => {
    const label = devServerStatusText(t, {
      ...base,
      previews: [],
      previewServerState: { status: 'starting' },
    });

    expect(label).toBe('baseChatAst.dev.starting');
  });
});
