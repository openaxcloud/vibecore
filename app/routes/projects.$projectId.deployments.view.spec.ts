import { describe, expect, it } from 'vitest';
import {
  DEPLOY_POLL_INTERVAL_MS,
  DEPLOY_REQUEST_TIMEOUT_MS,
  deploymentsRedirectQuery,
  formatDeploymentDuration,
  isActiveDeploymentStatus,
  shouldPollDeployments,
} from './projects.$projectId.deployments.view';

describe('DEPLOY_REQUEST_TIMEOUT_MS', () => {
  it('exceeds the backend 600s synchronous static-build cap', () => {
    /*
     * Regression: the deploy POST inherited the 30s apiRequest default and
     * aborted mid `npm install`, reporting a false failure for a build that the
     * backend (capped at 600s) actually completes. The client timeout must be
     * strictly longer than 600s so the action waits for the real outcome.
     */
    expect(DEPLOY_REQUEST_TIMEOUT_MS).toBeGreaterThan(600_000);
    expect(DEPLOY_REQUEST_TIMEOUT_MS).toBeGreaterThan(30_000);
  });
});

describe('isActiveDeploymentStatus', () => {
  it('treats queued/building/pending/in-flight statuses as active', () => {
    expect(isActiveDeploymentStatus('QUEUED')).toBe(true);
    expect(isActiveDeploymentStatus('BUILDING')).toBe(true);
    expect(isActiveDeploymentStatus('PENDING')).toBe(true);
    expect(isActiveDeploymentStatus('IN_PROGRESS')).toBe(true);
    expect(isActiveDeploymentStatus('DEPLOYING')).toBe(true);
  });

  it('is case- and whitespace-insensitive', () => {
    expect(isActiveDeploymentStatus('building')).toBe(true);
    expect(isActiveDeploymentStatus('  Queued  ')).toBe(true);
  });

  it('treats terminal statuses as inactive', () => {
    expect(isActiveDeploymentStatus('READY')).toBe(false);
    expect(isActiveDeploymentStatus('FAILED')).toBe(false);
    expect(isActiveDeploymentStatus('CANCELED')).toBe(false);
  });

  it('treats nullish/empty status as inactive', () => {
    expect(isActiveDeploymentStatus(null)).toBe(false);
    expect(isActiveDeploymentStatus(undefined)).toBe(false);
    expect(isActiveDeploymentStatus('')).toBe(false);
  });
});

describe('shouldPollDeployments', () => {
  it('polls while any deployment is still building', () => {
    /*
     * Regression: the panel never polled, so a BUILDING row sat stale forever
     * until a manual reload. Polling must stay on while any row is in flight.
     */
    expect(shouldPollDeployments([{ status: 'READY' }, { status: 'BUILDING' }])).toBe(true);
    expect(shouldPollDeployments([{ status: 'QUEUED' }])).toBe(true);
  });

  it('stops once every deployment is terminal', () => {
    expect(shouldPollDeployments([{ status: 'READY' }, { status: 'FAILED' }, { status: 'CANCELED' }])).toBe(false);
  });

  it('does not poll an empty or missing history', () => {
    expect(shouldPollDeployments([])).toBe(false);
    expect(shouldPollDeployments(null)).toBe(false);
    expect(shouldPollDeployments(undefined)).toBe(false);
  });
});

describe('deploymentsRedirectQuery', () => {
  it('prefers the submitted (hidden-input) workspaceId', () => {
    expect(deploymentsRedirectQuery('https://e-code.ai/projects/p1/deployments?workspace=ws-url', 'ws-body')).toBe(
      '?workspace=ws-body',
    );
  });

  it('falls back to the URL ?workspace= query when no body workspaceId', () => {
    /*
     * Regression: redeploy/cancel/rollback redirected to the bare path and
     * dropped ?workspace=, so the next NEW deploy submitted an empty workspaceId
     * and the backend scoped the build to the project root. The inline-action
     * forms POST to the current URL, so the query must be recovered from it.
     */
    expect(deploymentsRedirectQuery('https://e-code.ai/projects/p1/deployments?workspace=ws-1', '')).toBe(
      '?workspace=ws-1',
    );
    expect(deploymentsRedirectQuery('https://e-code.ai/projects/p1/deployments?workspace=ws-2', null)).toBe(
      '?workspace=ws-2',
    );
    expect(deploymentsRedirectQuery('https://e-code.ai/projects/p1/deployments?workspace=ws-3', undefined)).toBe(
      '?workspace=ws-3',
    );
  });

  it('returns an empty suffix when no workspace is present anywhere', () => {
    expect(deploymentsRedirectQuery('https://e-code.ai/projects/p1/deployments', '')).toBe('');
    expect(deploymentsRedirectQuery('https://e-code.ai/projects/p1/deployments', undefined)).toBe('');
  });

  it('url-encodes the workspace id', () => {
    expect(deploymentsRedirectQuery('https://e-code.ai/projects/p1/deployments', 'ws a/b')).toBe(
      `?workspace=${encodeURIComponent('ws a/b')}`,
    );
  });

  it('does not throw on a malformed request url', () => {
    expect(deploymentsRedirectQuery('not a url', '')).toBe('');
    expect(deploymentsRedirectQuery('not a url', 'ws-body')).toBe('?workspace=ws-body');
  });
});

describe('DEPLOY_POLL_INTERVAL_MS', () => {
  it('is a sane sub-minute cadence', () => {
    expect(DEPLOY_POLL_INTERVAL_MS).toBeGreaterThan(0);
    expect(DEPLOY_POLL_INTERVAL_MS).toBeLessThanOrEqual(10_000);
  });
});

describe('formatDeploymentDuration', () => {
  it('formats sub-minute durations as seconds', () => {
    expect(formatDeploymentDuration('2026-07-03T10:00:00Z', '2026-07-03T10:00:42Z')).toBe('42s');
    expect(formatDeploymentDuration('2026-07-03T10:00:00Z', '2026-07-03T10:00:00Z')).toBe('0s');
  });

  it('formats minute durations, omitting a zero seconds remainder', () => {
    expect(formatDeploymentDuration('2026-07-03T10:00:00Z', '2026-07-03T10:03:12Z')).toBe('3m 12s');
    expect(formatDeploymentDuration('2026-07-03T10:00:00Z', '2026-07-03T10:03:00Z')).toBe('3m');
  });

  it('formats hour durations, omitting a zero minutes remainder', () => {
    expect(formatDeploymentDuration('2026-07-03T10:00:00Z', '2026-07-03T11:04:00Z')).toBe('1h 4m');
    expect(formatDeploymentDuration('2026-07-03T10:00:00Z', '2026-07-03T12:00:00Z')).toBe('2h');
  });

  it('returns null when either bound is missing (in-flight or legacy rows)', () => {
    expect(formatDeploymentDuration(undefined, '2026-07-03T10:00:42Z')).toBeNull();
    expect(formatDeploymentDuration('2026-07-03T10:00:00Z', undefined)).toBeNull();
    expect(formatDeploymentDuration(null, null)).toBeNull();
  });

  it('returns null for malformed or negative ranges instead of fabricating a duration', () => {
    expect(formatDeploymentDuration('not a date', '2026-07-03T10:00:42Z')).toBeNull();
    expect(formatDeploymentDuration('2026-07-03T10:00:42Z', '2026-07-03T10:00:00Z')).toBeNull();
  });
});
