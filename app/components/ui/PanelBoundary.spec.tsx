/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PanelErrorBoundary } from './PanelBoundary';

const { logError } = vi.hoisted(() => ({
  logError: vi.fn(),
}));

vi.mock('~/lib/stores/logs', () => ({
  logStore: {
    logError,
  },
}));

function ThrowingPanel({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('Monitoring render failed');
  }

  return <div>Panel recovered</div>;
}

describe('<PanelErrorBoundary />', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    logError.mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shows an isolated fallback and logs sanitized panel crash context', () => {
    render(
      <PanelErrorBoundary
        panel="Monitoring"
        boundaryId="project:one:service:monitoring"
        projectId="project-one"
        autoRetry={false}
        getSnapshot={() => ({ panel: 'monitoring', token: 'secret-token' })}
      >
        <ThrowingPanel shouldThrow />
      </PanelErrorBoundary>,
    );

    expect(screen.getByText('The Monitoring panel crashed')).toBeTruthy();
    expect(screen.getByText('Monitoring render failed')).toBeTruthy();
    expect(logError).toHaveBeenCalledWith(
      'Monitoring panel boundary crashed',
      expect.any(Error),
      expect.objectContaining({
        boundaryId: 'project:one:service:monitoring',
        level: 'panel',
        projectId: 'project-one',
        snapshot: { panel: 'monitoring' },
      }),
    );
  });

  it('retries a crashing panel once automatically before keeping the fallback', () => {
    const { rerender } = render(
      <PanelErrorBoundary panel="Security" retryDelayMs={1000}>
        <ThrowingPanel shouldThrow />
      </PanelErrorBoundary>,
    );

    expect(screen.getByText('Retrying once automatically...')).toBeTruthy();

    vi.advanceTimersByTime(1000);
    rerender(
      <PanelErrorBoundary panel="Security" retryDelayMs={1000}>
        <ThrowingPanel shouldThrow={false} />
      </PanelErrorBoundary>,
    );

    expect(screen.getByText('Panel recovered')).toBeTruthy();
  });

  it('lets users log an explicit bug report from the fallback', () => {
    render(
      <PanelErrorBoundary panel="Security" autoRetry={false}>
        <ThrowingPanel shouldThrow />
      </PanelErrorBoundary>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Report bug' }));

    expect(screen.getByRole('button', { name: 'Bug report logged' })).toBeTruthy();
    expect(logError).toHaveBeenCalledTimes(2);
  });
});
