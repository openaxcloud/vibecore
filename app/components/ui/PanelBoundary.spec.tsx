/**
 * @vitest-environment jsdom
 */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PanelErrorBoundary } from './PanelBoundary';
import { createI18nInstance } from '~/lib/i18n/runtime';

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

function renderEnglish(node: React.ReactNode) {
  const i18n = createI18nInstance('en');
  const wrap = (value: React.ReactNode) => <I18nextProvider i18n={i18n}>{value}</I18nextProvider>;
  const view = render(wrap(node));

  return {
    ...view,
    rerender: (value: React.ReactNode) => view.rerender(wrap(value)),
  };
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
    renderEnglish(
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

    expect(screen.getByText('This panel encountered an error')).toBeTruthy();
    expect(screen.getByText('The error was isolated so the rest of the workspace can keep running.')).toBeTruthy();
    expect(screen.queryByText('Monitoring render failed')).toBeNull();
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
    const { rerender } = renderEnglish(
      <PanelErrorBoundary panel="Security" retryDelayMs={1000}>
        <ThrowingPanel shouldThrow />
      </PanelErrorBoundary>,
    );

    expect(screen.getByText('One automatic recovery attempt is in progress…')).toBeTruthy();

    vi.advanceTimersByTime(1000);
    rerender(
      <PanelErrorBoundary panel="Security" retryDelayMs={1000}>
        <ThrowingPanel shouldThrow={false} />
      </PanelErrorBoundary>,
    );

    expect(screen.getByText('Panel recovered')).toBeTruthy();
  });

  it('lets users log an explicit bug report from the fallback', () => {
    renderEnglish(
      <PanelErrorBoundary panel="Security" autoRetry={false}>
        <ThrowingPanel shouldThrow />
      </PanelErrorBoundary>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Report bug' }));

    expect(screen.getByRole('button', { name: 'Bug report logged' })).toBeTruthy();
    expect(logError).toHaveBeenCalledTimes(2);
  });

  it('switches the safe fallback and actions to French', async () => {
    const i18n = createI18nInstance('en');

    render(
      <I18nextProvider i18n={i18n}>
        <PanelErrorBoundary panel="Security" autoRetry={false}>
          <ThrowingPanel shouldThrow />
        </PanelErrorBoundary>
      </I18nextProvider>,
    );

    expect(screen.getByText('This panel encountered an error')).toBeTruthy();

    await act(async () => {
      await i18n.changeLanguage('fr');
    });

    expect(screen.getByText('Ce panneau a rencontré une erreur')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Recharger le panneau' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Signaler le bug' })).toBeTruthy();
  });
});
