/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ServiceStatusTab from './ServiceStatusTab';
import { deriveServiceStatusView } from './service-status-view';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { language: 'en', resolvedLanguage: 'en' } }),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('deriveServiceStatusView', () => {
  it('reports loading while probes are in flight (not a blank panel)', () => {
    expect(deriveServiceStatusView(true, false, [])).toEqual({ kind: 'loading' });

    /* Loading must win even if a prior result set is still present. */
    expect(
      deriveServiceStatusView(true, false, [{ endpoint: '/api/health', ok: true, status: 200, latency: 5 }]),
    ).toEqual({ kind: 'loading' });
  });

  it('reports error when the whole batch failed instead of silently emptying', () => {
    expect(deriveServiceStatusView(false, true, [])).toEqual({ kind: 'error' });
  });

  it('reports empty only when settled with zero probes', () => {
    expect(deriveServiceStatusView(false, false, [])).toEqual({ kind: 'empty' });
  });

  it('renders the rows once settled, including all-down results', () => {
    const statuses = [{ endpoint: '/api/health', ok: false, status: 0, latency: 12 }];
    expect(deriveServiceStatusView(false, false, statuses)).toEqual({ kind: 'ready', statuses });
  });
});

describe('ServiceStatusTab', () => {
  it('shows a loading state while fetching (never a blank panel)', () => {
    /* A fetch that never resolves keeps the component in the in-flight state. */
    const neverResolves = new Promise<Response>(() => undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn(() => neverResolves),
    );

    const { container } = render(<ServiceStatusTab />);

    expect(container.querySelector('[role="status"]')).not.toBeNull();
    expect(container.textContent).toContain('Checking service status');
  });

  it('never settles into a blank panel when every probe fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('network down'))),
    );

    const { container } = render(<ServiceStatusTab />);

    /*
     * Individual fetch rejections are caught per-endpoint and become ok=false rows,
     * so the component settles into the ready state with status=0 entries. The key
     * regression guard: once loading clears the panel still has visible content
     * (four endpoint rows), never the old empty <div> with zero feedback.
     */
    await waitFor(() => {
      expect(container.querySelector('[role="status"]')).toBeNull();
    });

    const rows = container.querySelectorAll('[role="listitem"]');
    expect(rows.length).toBe(4);
    expect(container.textContent).toContain('/api/health');
  });

  it('renders endpoint rows after a successful settle', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: true, status: 200 } as Response)),
    );

    render(<ServiceStatusTab />);

    await waitFor(() => {
      expect(screen.getByText('/api/health')).not.toBeNull();
    });

    expect(screen.getAllByText('HTTP 200').length).toBeGreaterThan(0);
  });
});
