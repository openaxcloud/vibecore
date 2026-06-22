import { describe, expect, it } from 'vitest';
import {
  DEPLOY_POLL_INTERVAL_MS,
  DEPLOY_REQUEST_TIMEOUT_MS,
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

describe('DEPLOY_POLL_INTERVAL_MS', () => {
  it('is a sane sub-minute cadence', () => {
    expect(DEPLOY_POLL_INTERVAL_MS).toBeGreaterThan(0);
    expect(DEPLOY_POLL_INTERVAL_MS).toBeLessThanOrEqual(10_000);
  });
});
