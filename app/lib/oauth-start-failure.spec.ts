import { describe, expect, it } from 'vitest';
import { classifyOAuthStartFailure } from './oauth-start-failure';

describe('classifyOAuthStartFailure', () => {
  it('re-throws a Response (deliberate apiRequest redirect like 401 -> login)', () => {
    const redirectResponse = new Response(null, { status: 302, headers: { Location: '/login' } });
    const outcome = classifyOAuthStartFailure('github', redirectResponse);

    expect(outcome).toEqual({ rethrow: redirectResponse });
  });

  it('redirects to a friendly login error for an Error rejection (api unreachable)', () => {
    const outcome = classifyOAuthStartFailure('github', new TypeError('fetch failed'));

    expect(outcome).toEqual({
      redirectTo: '/login?oauth=github&error=start_failed&detail=api_unreachable',
      detail: 'fetch failed',
    });
  });

  it('redirects to a friendly login error for an AbortError (request timeout)', () => {
    const abort = new DOMException('The operation was aborted', 'AbortError');
    const outcome = classifyOAuthStartFailure('google', abort);

    expect(outcome).toEqual({
      redirectTo: '/login?oauth=google&error=start_failed&detail=api_unreachable',
      detail: 'The operation was aborted',
    });
  });

  it('falls back to api_unreachable detail for a non-Error rejection', () => {
    const outcome = classifyOAuthStartFailure('github', 'boom');

    expect(outcome).toEqual({
      redirectTo: '/login?oauth=github&error=start_failed&detail=api_unreachable',
      detail: 'api_unreachable',
    });
  });
});
