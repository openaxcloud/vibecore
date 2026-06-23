// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { isAbortError } from './main';

describe('isAbortError', () => {
  it('detects native AbortController fetch abort errors', () => {
    const controller = new AbortController();
    controller.abort();
    expect(isAbortError(controller.signal.reason)).toBe(true);
  });

  it('detects a DOMException named AbortError', () => {
    expect(isAbortError(new DOMException('aborted', 'AbortError'))).toBe(true);
  });

  it('detects a plain object/Error carrying name === AbortError', () => {
    expect(isAbortError({ name: 'AbortError' })).toBe(true);
    expect(isAbortError(Object.assign(new Error('aborted'), { name: 'AbortError' }))).toBe(true);
  });

  it('does not treat real request failures as aborts', () => {
    expect(isAbortError(new Error('Request failed with 500'))).toBe(false);
    expect(isAbortError(new DOMException('boom', 'NetworkError'))).toBe(false);
  });

  it('is safe on null/undefined/primitive inputs', () => {
    expect(isAbortError(null)).toBe(false);
    expect(isAbortError(undefined)).toBe(false);
    expect(isAbortError('AbortError')).toBe(false);
    expect(isAbortError(42)).toBe(false);
  });
});
