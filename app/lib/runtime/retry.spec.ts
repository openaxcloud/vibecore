import { RuntimeError } from '@vibecore/runtime-contract';
import { describe, expect, it, vi } from 'vitest';
import { isTransientRuntimeError, withRuntimeRetry } from './retry';

describe('isTransientRuntimeError', () => {
  it('classifies 502/503/504 runtime proxy errors as transient', () => {
    for (const status of [502, 503, 504, 429, 500, 408]) {
      const error = new RuntimeError(`Remote runtime request failed: ${status}`, {
        code: 'REMOTE_RUNTIME_REQUEST_FAILED',
        status,
      });
      expect(isTransientRuntimeError(error)).toBe(true);
    }
  });

  it('classifies workspace-not-started as transient', () => {
    const error = new RuntimeError('Remote workspace has not been started', { code: 'WORKSPACE_NOT_STARTED' });
    expect(isTransientRuntimeError(error)).toBe(true);
  });

  it('classifies network/fetch failures as transient', () => {
    expect(isTransientRuntimeError(new TypeError('Failed to fetch'))).toBe(true);
    expect(isTransientRuntimeError(new Error('getaddrinfo ENOTFOUND ws-123'))).toBe(true);
    expect(isTransientRuntimeError(new Error('connect ECONNREFUSED 10.0.0.1:443'))).toBe(true);
  });

  it('retries a provisioning 404 (workspace/project not resolvable yet) so dependency sync self-heals', () => {
    const workspaceRace = new RuntimeError('Remote runtime request failed: 404', {
      code: 'WORKSPACE_NOT_FOUND',
      status: 404,
    });
    expect(isTransientRuntimeError(workspaceRace)).toBe(true);

    const projectRace = new RuntimeError('Remote runtime request failed: 404', {
      code: 'PROJECT_NOT_FOUND',
      status: 404,
    });
    expect(isTransientRuntimeError(projectRace)).toBe(true);
  });

  it('does not retry genuine 4xx client/auth errors', () => {
    const notFound = new RuntimeError('Remote runtime request failed: 404', {
      code: 'REMOTE_RUNTIME_REQUEST_FAILED',
      status: 404,
    });
    expect(isTransientRuntimeError(notFound)).toBe(false);

    const forbidden = new RuntimeError('Remote runtime request failed: 403', {
      code: 'REMOTE_RUNTIME_REQUEST_FAILED',
      status: 403,
    });
    expect(isTransientRuntimeError(forbidden)).toBe(false);
  });

  it('does not retry arbitrary logic errors', () => {
    expect(isTransientRuntimeError(new Error('Unexpected end of JSON input'))).toBe(false);
  });

  it('does not retry a quota-driven 429 (hard ceiling, not a transient rate-limit)', () => {
    // The proxied quota body is surfaced on RuntimeError.details as a JSON string.
    const quotaInDetails = new RuntimeError('Remote runtime request failed: 429', {
      code: 'REMOTE_RUNTIME_REQUEST_FAILED',
      status: 429,
      details: JSON.stringify({ code: 'QUOTA_EXCEEDED', quotaKey: 'workspaces.active', used: 1, limit: 1 }),
    });
    expect(isTransientRuntimeError(quotaInDetails)).toBe(false);

    const quotaInMessage = new RuntimeError('Quota exceeded for terminals.concurrent', {
      code: 'REMOTE_RUNTIME_REQUEST_FAILED',
      status: 429,
    });
    expect(isTransientRuntimeError(quotaInMessage)).toBe(false);
  });

  it('still retries a plain rate-limit 429 (no quota signal)', () => {
    const rateLimited = new RuntimeError('Remote runtime request failed: 429', {
      code: 'REMOTE_RUNTIME_REQUEST_FAILED',
      status: 429,
    });
    expect(isTransientRuntimeError(rateLimited)).toBe(true);
  });
});

describe('withRuntimeRetry', () => {
  it('returns immediately on success without retrying', async () => {
    const operation = vi.fn().mockResolvedValue('ok');
    const result = await withRuntimeRetry(operation, { baseDelayMs: 1 });
    expect(result).toBe('ok');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('retries transient errors and eventually succeeds', async () => {
    const transient = new RuntimeError('boom', { code: 'REMOTE_RUNTIME_REQUEST_FAILED', status: 502 });

    const operation = vi
      .fn()
      .mockRejectedValueOnce(transient)
      .mockRejectedValueOnce(transient)
      .mockResolvedValue('done');

    const onRetry = vi.fn();
    const result = await withRuntimeRetry(operation, { baseDelayMs: 1, onRetry });

    expect(result).toBe('done');
    expect(operation).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it('gives up after the configured number of attempts and throws the last error', async () => {
    const transient = new RuntimeError('boom', { code: 'REMOTE_RUNTIME_REQUEST_FAILED', status: 503 });
    const operation = vi.fn().mockRejectedValue(transient);

    await expect(withRuntimeRetry(operation, { attempts: 3, baseDelayMs: 1 })).rejects.toBe(transient);
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('does not retry non-transient errors', async () => {
    const fatal = new RuntimeError('nope', { code: 'REMOTE_RUNTIME_REQUEST_FAILED', status: 404 });
    const operation = vi.fn().mockRejectedValue(fatal);

    await expect(withRuntimeRetry(operation, { attempts: 4, baseDelayMs: 1 })).rejects.toBe(fatal);
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
