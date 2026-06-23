import { describe, expect, it } from 'vitest';
import { resolveVercelPollOutcome } from './vercel-deploy-poll';

describe('resolveVercelPollOutcome', () => {
  it('reports ready when the deployment reached READY', () => {
    expect(
      resolveVercelPollOutcome({
        retryCount: 5,
        maxRetries: 60,
        consecutiveFailures: 0,
        deploymentState: 'READY',
      }),
    ).toEqual({ kind: 'ready', state: 'READY' });
  });

  it('reports error when the deployment reached ERROR', () => {
    expect(
      resolveVercelPollOutcome({
        retryCount: 5,
        maxRetries: 60,
        consecutiveFailures: 0,
        deploymentState: 'ERROR',
      }),
    ).toEqual({ kind: 'error' });
  });

  it('reports timed-out when a real in-progress state never finished within the budget', () => {
    expect(
      resolveVercelPollOutcome({
        retryCount: 60,
        maxRetries: 60,
        consecutiveFailures: 0,
        deploymentState: 'BUILDING',
      }),
    ).toEqual({ kind: 'timed-out' });
  });

  it('reports pending (NOT timed-out) when every status poll failed and no state was ever observed', () => {
    /*
     * This is the regression: a deploy that may have succeeded on Vercel's side
     * but whose status endpoint kept returning non-ok responses must not be
     * reported as a hard timeout.
     */
    expect(
      resolveVercelPollOutcome({
        retryCount: 60,
        maxRetries: 60,
        consecutiveFailures: 60,
        deploymentState: '',
      }),
    ).toEqual({ kind: 'pending' });
  });

  it('reports pending when the loop ended early on a non-terminal known state', () => {
    expect(
      resolveVercelPollOutcome({
        retryCount: 3,
        maxRetries: 60,
        consecutiveFailures: 0,
        deploymentState: 'QUEUED',
      }),
    ).toEqual({ kind: 'pending' });
  });

  it('prefers a terminal READY state even if the budget was exhausted', () => {
    expect(
      resolveVercelPollOutcome({
        retryCount: 60,
        maxRetries: 60,
        consecutiveFailures: 0,
        deploymentState: 'READY',
      }),
    ).toEqual({ kind: 'ready', state: 'READY' });
  });

  it('prefers ERROR over timeout/pending bookkeeping', () => {
    expect(
      resolveVercelPollOutcome({
        retryCount: 60,
        maxRetries: 60,
        consecutiveFailures: 10,
        deploymentState: 'ERROR',
      }),
    ).toEqual({ kind: 'error' });
  });
});
