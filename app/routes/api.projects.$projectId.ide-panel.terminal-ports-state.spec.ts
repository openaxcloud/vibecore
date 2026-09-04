import { afterEach, describe, expect, it, vi } from 'vitest';

import { toResponse } from '~/lib/test/rr7-data';

/*
 * R-3 — the Terminal's "Connections" tab mounts the real `ProjectPortsPanel`
 * instead of re-rendering the port list itself.
 *
 * That panel does not just list ports: it shows which one is PRIMARY and
 * whether each is public or private, both persisted server-side in
 * `VIBECORE_PORTS_STATE`. The terminal loader did not return that state, so a
 * naive mount would have rendered every port as public with no primary — the
 * toggle writing correctly while displaying the wrong thing, which is exactly
 * the class of "two renderers disagree" defect R-3 exists to remove.
 *
 * This pins the payload contract: whatever the ports panel needs, the terminal
 * panel must hand it too.
 */
const apiRequest = vi.fn();

vi.mock('~/lib/enterprise-api.server', async () => {
  const actual = await vi.importActual<typeof import('~/lib/enterprise-api.server')>('~/lib/enterprise-api.server');

  return {
    ...actual,
    apiRequest: (...args: unknown[]) => apiRequest(...args),
  };
});

const PORTS_STATE = JSON.stringify({ primaryPort: 5173, visibility: { '5173': 'private' } });

function respondFor(url: string) {
  if (url.endsWith('/env-vars')) {
    return { envVars: [{ key: 'VIBECORE_PORTS_STATE', value: PORTS_STATE }] };
  }

  if (url.endsWith('/secrets')) {
    return { secrets: [] };
  }

  if (url.endsWith('/activity')) {
    return { activity: [] };
  }

  if (url.endsWith('/dashboard')) {
    return { workspace: { id: 'ws-1' }, project: { id: 'proj-42' } };
  }

  if (url.endsWith('/ports')) {
    return { ports: [{ port: 5173, ready: true, url: 'https://preview.test' }] };
  }

  if (url.includes('/projects/proj-42') && !url.includes('/')) {
    return { project: { id: 'proj-42' } };
  }

  return {};
}

function loaderArgs(panel: string, projectId = 'proj-42') {
  return {
    request: new Request(`https://app.test/api/projects/${projectId}/ide-panel/${panel}`, {
      headers: { accept: 'application/json' },
    }),
    params: { projectId, panel },
  } as any;
}

async function payloadFor(panel: string) {
  apiRequest.mockImplementation(async (_request: unknown, url: string) => respondFor(String(url)));

  const { loader } = await import('./api.projects.$projectId.ide-panel.$panel');
  const response = toResponse(await loader(loaderArgs(panel)));

  return ((await (response as Response).json()) as any)?.data ?? {};
}

describe('terminal panel payload feeds the mounted ports panel', () => {
  afterEach(() => {
    apiRequest.mockReset();
  });

  it('returns the persisted primary port and visibility, like the ports panel does', async () => {
    const data = await payloadFor('terminal');

    expect(data.portsState).toBeDefined();
    expect(data.portsState.primaryPort).toBe(5173);
    expect(data.portsState.visibility).toEqual({ '5173': 'private' });
  });

  /**
   * Counter-proof (règle 6): the assertion above is only meaningful if the
   * ports panel really needs that shape. Same key, same values, read from the
   * panel that owns the screen — if these two ever drift, the mount is wrong.
   */
  it('matches what the ports panel itself returns', async () => {
    const terminal = await payloadFor('terminal');

    apiRequest.mockReset();

    const ports = await payloadFor('ports');

    expect(terminal.portsState).toEqual(ports.portsState);
  });

  /**
   * Règle 14 — a passing "portsState is there" means nothing if the loader
   * silently returned an empty envelope. Prove the payload is real.
   */
  it('really loaded the terminal payload', async () => {
    const data = await payloadFor('terminal');

    expect(data.workspaceId).toBeTruthy();
    expect(data.terminalState).toBeDefined();
  });
});
