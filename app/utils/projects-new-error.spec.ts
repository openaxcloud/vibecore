import { describe, expect, it } from 'vitest';
import { categorizeProjectsNewError } from './projects-new-error';

/**
 * `isRouteErrorResponse` from @remix-run/react checks for `status`,
 * `statusText` and `data` on the value, so we can fabricate compatible
 * shapes for unit tests without booting Remix.
 */
function routeErrorResponse(status: number, options: { statusText?: string; data?: unknown } = {}) {
  return {
    status,
    statusText: options.statusText ?? '',
    data: options.data,
    internal: false,
  };
}

describe('categorizeProjectsNewError', () => {
  it('maps a 401 RouteErrorResponse to the auth branch', () => {
    const descriptor = categorizeProjectsNewError(routeErrorResponse(401, { statusText: 'Unauthorized' }));
    expect(descriptor.kind).toBe('auth');
    expect(descriptor.title).toBe('Sign in to create a project');
    expect(descriptor.detail).toBe('Unauthorized');
  });

  it('maps a 403 RouteErrorResponse to the auth branch', () => {
    const descriptor = categorizeProjectsNewError(routeErrorResponse(403, { statusText: 'Forbidden' }));
    expect(descriptor.kind).toBe('auth');
  });

  it('prefers data.error when present for the detail string', () => {
    const descriptor = categorizeProjectsNewError(
      routeErrorResponse(401, { statusText: 'Unauthorized', data: { error: 'Session expired' } }),
    );
    expect(descriptor.detail).toBe('Session expired');
  });

  it('maps a 5xx RouteErrorResponse to the server branch', () => {
    const descriptor = categorizeProjectsNewError(routeErrorResponse(503, { statusText: 'Service Unavailable' }));
    expect(descriptor.kind).toBe('server');
    expect(descriptor.title).toMatch(/project service/i);
  });

  it('maps project-count quota errors to the quota branch', () => {
    const descriptor = categorizeProjectsNewError(
      routeErrorResponse(429, { data: { error: 'Quota exceeded for projects.count' } }),
    );
    expect(descriptor.kind).toBe('quota');
    expect(descriptor.title).toBe('Project quota reached');
  });

  it('maps bare project-count quota Errors to the quota branch', () => {
    const descriptor = categorizeProjectsNewError(new Error('Quota exceeded for projects.count'));
    expect(descriptor.kind).toBe('quota');
  });

  it('maps a 404 RouteErrorResponse to the unknown branch (not auth)', () => {
    const descriptor = categorizeProjectsNewError(routeErrorResponse(404));
    expect(descriptor.kind).toBe('unknown');
    expect(descriptor.title).not.toMatch(/sign in/i);
  });

  it('maps "fetch failed" Error to the network branch', () => {
    const descriptor = categorizeProjectsNewError(new TypeError('fetch failed'));
    expect(descriptor.kind).toBe('network');
    expect(descriptor.title).toBe('Connection issue');
    expect(descriptor.subtitle).toMatch(/sign in again/i);
  });

  it('maps "Failed to fetch" (Chrome) Error to the network branch', () => {
    expect(categorizeProjectsNewError(new TypeError('Failed to fetch')).kind).toBe('network');
  });

  it('maps "Load failed" (Safari) Error to the network branch', () => {
    expect(categorizeProjectsNewError(new TypeError('Load failed')).kind).toBe('network');
  });

  it('maps ECONNREFUSED to the network branch', () => {
    expect(categorizeProjectsNewError(new Error('connect ECONNREFUSED 127.0.0.1:3001')).kind).toBe('network');
  });

  it('maps a wrapped network error via cause to the network branch', () => {
    const cause = new TypeError('fetch failed');
    const outer = new Error('Could not load organization');
    (outer as { cause?: unknown }).cause = cause;
    expect(categorizeProjectsNewError(outer).kind).toBe('network');
  });

  it('falls back to unknown for an opaque Error', () => {
    const descriptor = categorizeProjectsNewError(new Error('Something exploded internally'));
    expect(descriptor.kind).toBe('unknown');
    expect(descriptor.title).not.toMatch(/sign in/i);
    expect(descriptor.detail).toBe('Something exploded internally');
  });

  it('falls back to unknown for a bare string', () => {
    expect(categorizeProjectsNewError('boom').kind).toBe('unknown');
  });

  it('handles null / undefined defensively', () => {
    expect(categorizeProjectsNewError(null).kind).toBe('unknown');
    expect(categorizeProjectsNewError(undefined).kind).toBe('unknown');
  });

  it('never echoes the raw error string in the title', () => {
    for (const input of [
      new TypeError('fetch failed'),
      new Error('Network request failed: ECONNRESET'),
      routeErrorResponse(503, { statusText: 'kaboom' }),
      routeErrorResponse(404),
      'bare-string-error',
      undefined,
    ]) {
      const descriptor = categorizeProjectsNewError(input);
      expect(descriptor.title).not.toMatch(/fetch failed/i);
      expect(descriptor.title).not.toMatch(/ECONNRESET/);
      expect(descriptor.title).not.toMatch(/kaboom/);
    }
  });
});
