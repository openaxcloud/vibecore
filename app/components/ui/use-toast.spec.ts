/**
 * @vitest-environment jsdom
 */
import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const toastMock = vi.hoisted(() => {
  const mock = Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    loading: vi.fn(),
    update: vi.fn(),
  });

  return mock;
});

vi.mock('react-toastify', () => ({ toast: toastMock }));
vi.mock('~/lib/stores/theme', () => ({ themeStore: { get: () => 'dark' } }));

import { configuredToast, resolveToast, useToast } from './use-toast';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('configuredToast.loading', () => {
  it('never auto-closes while the work is still running', () => {
    /*
     * Regression: the loading variant used to pass `autoClose: 3000`. A loading
     * toast that dismisses itself while the underlying work continues is a bug —
     * it must stay up until resolved via resolveToast().
     */
    configuredToast.loading('Working…');

    expect(toastMock.loading).toHaveBeenCalledWith('Working…', expect.objectContaining({ autoClose: false }));
  });

  it('still lets callers override options', () => {
    configuredToast.loading('Working…', { toastId: 'my-id' });

    expect(toastMock.loading).toHaveBeenCalledWith(
      'Working…',
      expect.objectContaining({ autoClose: false, toastId: 'my-id' }),
    );
  });
});

describe('resolveToast', () => {
  it('updates a loading toast in place to success', () => {
    resolveToast('load-1', true, 'Saved!');

    expect(toastMock.update).toHaveBeenCalledWith(
      'load-1',
      expect.objectContaining({
        render: 'Saved!',
        type: 'success',
        isLoading: false,
        autoClose: 3000,
        closeButton: true,
        closeOnClick: true,
      }),
    );
  });

  it('updates a loading toast in place to error', () => {
    resolveToast('load-2', false, 'Save failed');

    expect(toastMock.update).toHaveBeenCalledWith(
      'load-2',
      expect.objectContaining({ render: 'Save failed', type: 'error', isLoading: false, autoClose: 3000 }),
    );
  });

  it('lets callers override update options', () => {
    resolveToast('load-3', true, 'Done', { autoClose: 8000 });

    expect(toastMock.update).toHaveBeenCalledWith('load-3', expect.objectContaining({ autoClose: 8000 }));
  });
});

describe('useToast', () => {
  it('does not hard-code a position, so toasts inherit the global ToastContainer position', () => {
    /*
     * Regression: the hook used to pass `position: 'bottom-right'`, contradicting
     * the app-wide <ToastContainer position="top-right"> in root.tsx.
     */
    const { result } = renderHook(() => useToast());

    result.current.toast('hello');

    expect(toastMock.info).toHaveBeenCalledTimes(1);

    const options = toastMock.info.mock.calls[0][1];
    expect(options).not.toHaveProperty('position');
    expect(options).toMatchObject({ autoClose: 3000, theme: 'dark' });
  });

  it('routes typed helpers to the matching toastify method', () => {
    const { result } = renderHook(() => useToast());

    result.current.success('ok');
    result.current.error('nope');

    expect(toastMock.success).toHaveBeenCalledWith('ok', expect.not.objectContaining({ position: expect.anything() }));
    expect(toastMock.error).toHaveBeenCalledWith('nope', expect.anything());
  });
});
