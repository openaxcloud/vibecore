import { describe, expect, it } from 'vitest';
import { isWorkspaceDnsNotResolvedYet } from './app.js';

/*
 * BUG-API-004: during IDE load the API hit the workspace Service before kube-dns
 * had propagated its record and rendered a bare `502
 * WORKSPACE_AGENT_REQUEST_FAILED` to the user — a server error for a workspace
 * that was simply still coming up. These cover the shapes Node actually throws
 * so the detection cannot regress into message string-matching.
 */
describe('isWorkspaceDnsNotResolvedYet', () => {
  it('detects a bare ENOTFOUND', () => {
    expect(isWorkspaceDnsNotResolvedYet(Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' }))).toBe(
      true,
    );
  });

  it('detects EAI_AGAIN (transient resolver failure)', () => {
    expect(isWorkspaceDnsNotResolvedYet(Object.assign(new Error('nope'), { code: 'EAI_AGAIN' }))).toBe(true);
  });

  it('detects the undici shape: TypeError(fetch failed) wrapping the cause', () => {
    const cause = Object.assign(new Error('getaddrinfo ENOTFOUND workspace-ws-x.workspaces.svc.cluster.local'), {
      code: 'ENOTFOUND',
    });

    expect(isWorkspaceDnsNotResolvedYet(Object.assign(new TypeError('fetch failed'), { cause }))).toBe(true);
  });

  it('detects an AggregateError carrying the DNS failure among others', () => {
    const aggregate = Object.assign(new Error('all attempts failed'), {
      errors: [
        Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }),
        Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' }),
      ],
    });

    expect(isWorkspaceDnsNotResolvedYet(aggregate)).toBe(true);
  });

  it('does NOT claim a provisioning window for a genuine connection refusal', () => {
    expect(
      isWorkspaceDnsNotResolvedYet(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })),
    ).toBe(false);
  });

  it('does NOT loop forever on a self-referencing cause chain', () => {
    const looped = Object.assign(new Error('boom'), { code: 'EOTHER' }) as Error & { cause?: unknown };
    looped.cause = looped;

    expect(isWorkspaceDnsNotResolvedYet(looped)).toBe(false);
  });

  it('is false for non-errors', () => {
    expect(isWorkspaceDnsNotResolvedYet(undefined)).toBe(false);
    expect(isWorkspaceDnsNotResolvedYet(null)).toBe(false);
  });
});
