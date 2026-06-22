import { RuntimeError } from '@vibecore/runtime-contract';
import { describe, expect, it } from 'vitest';
import { isWorkspaceQuotaError, workspaceQuotaPrompt } from './workspace-quota';

describe('isWorkspaceQuotaError', () => {
  it('treats a 429 remote runtime error as a quota error', () => {
    /*
     * The billing chokepoint answers every exhausted quota with HTTP 429, and
     * the remote runtime adapter surfaces it as status 429. The IDE previously
     * only branched on 402, so this case was the dead-code regression.
     */
    const error = new RuntimeError('Remote runtime request failed: 429', {
      code: 'REMOTE_RUNTIME_REQUEST_FAILED',
      status: 429,
    });
    expect(isWorkspaceQuotaError(error)).toBe(true);
  });

  it('treats a 402 payment-required runtime error as a quota error', () => {
    const error = new RuntimeError('Payment required', {
      code: 'REMOTE_RUNTIME_REQUEST_FAILED',
      status: 402,
    });
    expect(isWorkspaceQuotaError(error)).toBe(true);
  });

  it('treats an explicit QUOTA_EXCEEDED code as a quota error even without a status', () => {
    const error = new RuntimeError('Quota exceeded for workspaces.active', { code: 'QUOTA_EXCEEDED' });
    expect(isWorkspaceQuotaError(error)).toBe(true);
  });

  it('treats a quotaKey in the details body as a quota error', () => {
    const error = new RuntimeError('Remote runtime request failed: 429', {
      code: 'REMOTE_RUNTIME_REQUEST_FAILED',
      status: 429,
      details: JSON.stringify({ code: 'QUOTA_EXCEEDED', quotaKey: 'workspaces.active' }),
    });
    expect(isWorkspaceQuotaError(error)).toBe(true);
  });

  it('does not classify an unrelated runtime error as a quota error', () => {
    const error = new RuntimeError('Remote runtime request failed: 502', {
      code: 'REMOTE_RUNTIME_REQUEST_FAILED',
      status: 502,
    });
    expect(isWorkspaceQuotaError(error)).toBe(false);
  });

  it('does not classify a plain Error as a quota error', () => {
    expect(isWorkspaceQuotaError(new Error('boom'))).toBe(false);
    expect(isWorkspaceQuotaError(undefined)).toBe(false);
  });
});

describe('workspaceQuotaPrompt', () => {
  it('returns generic copy for a bare 429 with no quotaKey', () => {
    const error = new RuntimeError('Remote runtime request failed: 429', {
      code: 'REMOTE_RUNTIME_REQUEST_FAILED',
      status: 429,
    });
    expect(workspaceQuotaPrompt(error)).toEqual({
      warning: 'Workspace quota exceeded',
      upgrade: 'Upgrade your plan to start more workspaces.',
    });
  });

  it('names the active-workspace limit when the details body carries the quotaKey', () => {
    const error = new RuntimeError('Remote runtime request failed: 429', {
      code: 'REMOTE_RUNTIME_REQUEST_FAILED',
      status: 429,
      details: JSON.stringify({ code: 'QUOTA_EXCEEDED', quotaKey: 'workspaces.active' }),
    });
    expect(workspaceQuotaPrompt(error)).toEqual({
      warning: 'You have reached your active workspace limit.',
      upgrade: 'Upgrade your plan to start more active workspaces.',
    });
  });

  it('names the concurrent-terminal limit when the details body carries that quotaKey', () => {
    const error = new RuntimeError('Remote runtime request failed: 429', {
      code: 'REMOTE_RUNTIME_REQUEST_FAILED',
      status: 429,
      details: JSON.stringify({ code: 'QUOTA_EXCEEDED', quotaKey: 'terminals.concurrent' }),
    });
    expect(workspaceQuotaPrompt(error)).toEqual({
      warning: 'You have reached your concurrent terminal limit.',
      upgrade: 'Upgrade your plan to start more concurrent terminals.',
    });
  });

  it('tolerates a non-JSON details body and falls back to generic copy', () => {
    const error = new RuntimeError('Remote runtime request failed: 429', {
      code: 'REMOTE_RUNTIME_REQUEST_FAILED',
      status: 429,
      details: 'Too Many Requests',
    });
    expect(workspaceQuotaPrompt(error)).toEqual({
      warning: 'Workspace quota exceeded',
      upgrade: 'Upgrade your plan to start more workspaces.',
    });
  });

  it('returns undefined for non-quota errors so callers fall through', () => {
    const error = new RuntimeError('Remote runtime request failed: 502', {
      code: 'REMOTE_RUNTIME_REQUEST_FAILED',
      status: 502,
    });
    expect(workspaceQuotaPrompt(error)).toBeUndefined();
  });
});
