/** @vitest-environment jsdom */

import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => {
  const readable = <T,>(value: T) => ({
    value,
    get() {
      return this.value;
    },
  });

  return {
    quotaWarning: readable<string | undefined>(undefined),
    billingUpgradePrompt: readable<string | undefined>(undefined),
    workspaceLoading: readable(false),
    fileSaveIssues: readable<Record<string, unknown>>({}),
    requestWorkspaceRetry: vi.fn(),
    retryFileSave: vi.fn(async () => undefined),
    resolveFileSaveConflict: vi.fn(async () => undefined),
    setSelectedFile: vi.fn(),
  };
});

vi.mock('@nanostores/react', () => ({
  useStore: <T,>(store: { get: () => T }) => store.get(),
}));

vi.mock('~/lib/stores/workbench', () => ({
  workbenchStore: harness,
}));

import { FileSaveIssueNotice, WorkspaceQuotaNotice } from './IdeIntegrityNotices';
import { ideIntegrityEn, ideIntegrityFr } from '~/lib/i18n/catalogs/ide-integrity';
import { createI18nInstance } from '~/lib/i18n/runtime';

function renderIn(language: 'en' | 'fr', node: ReactNode) {
  return render(<I18nextProvider i18n={createI18nInstance(language)}>{node}</I18nextProvider>);
}

describe('IDE integrity notices', () => {
  beforeEach(() => {
    harness.quotaWarning.value = undefined;
    harness.billingUpgradePrompt.value = undefined;
    harness.workspaceLoading.value = false;
    harness.fileSaveIssues.value = {};
    harness.requestWorkspaceRetry.mockReset();
    harness.retryFileSave.mockReset().mockResolvedValue(undefined);
    harness.resolveFileSaveConflict.mockReset().mockResolvedValue(undefined);
    harness.setSelectedFile.mockReset();
  });

  afterEach(cleanup);

  it('keeps exact English/French catalog parity', () => {
    expect(Object.keys(ideIntegrityFr).sort()).toEqual(Object.keys(ideIntegrityEn).sort());
  });

  it('renders an assertive, actionable workspace quota state and wires Retry', () => {
    harness.quotaWarning.value = 'You reached the active workspace limit.';
    harness.billingUpgradePrompt.value = 'Stop another workspace or upgrade your plan.';

    renderIn('en', <WorkspaceQuotaNotice />);

    const notice = screen.getByRole('alert', { name: 'Workspace quota action required' });
    expect(notice.getAttribute('aria-live')).toBe('assertive');
    expect(screen.getByText('You reached the active workspace limit.')).toBeTruthy();
    expect(screen.getByText('Stop another workspace or upgrade your plan.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Review plans and usage' }).getAttribute('href')).toBe('/billing');

    fireEvent.click(screen.getByRole('button', { name: 'Retry workspace start' }));
    expect(harness.requestWorkspaceRetry).toHaveBeenCalledTimes(1);
  });

  it('keeps quota context visible and disables duplicate retries while start is pending', () => {
    harness.quotaWarning.value = 'You reached the active workspace limit.';
    harness.workspaceLoading.value = true;

    renderIn('en', <WorkspaceQuotaNotice />);

    const retry = screen.getByRole('button', { name: 'Retrying…' });
    expect(retry.getAttribute('aria-busy')).toBe('true');
    expect(retry.hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('You reached the active workspace limit.')).toBeTruthy();
  });

  it('renders a retry-only state for a transport/write failure', async () => {
    const filePath = '/home/project/src/App.tsx';
    harness.fileSaveIssues.value = {
      [filePath]: { kind: 'error', filePath, localContent: 'local edit', detectedAt: 1 },
    };

    renderIn('en', <FileSaveIssueNotice filePath={filePath} />);

    expect(screen.getByText('This file is not saved yet — App.tsx')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Keep my version' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Retry save' }));
    await waitFor(() => expect(harness.retryFileSave).toHaveBeenCalledWith(filePath));
  });

  it('offers review plus two explicit conflict resolutions, never a blind overwrite', async () => {
    const filePath = '/home/project/src/App.tsx';
    harness.fileSaveIssues.value = {
      [filePath]: {
        kind: 'conflict',
        filePath,
        localContent: 'local edit',
        remoteContent: 'remote edit',
        detectedAt: 1,
      },
    };

    const historyEvent = vi.fn();
    window.addEventListener('vibecore:open-file-history', historyEvent);

    renderIn('en', <FileSaveIssueNotice filePath={filePath} />);

    const notice = screen.getByRole('alert', { name: 'File save action required' });
    expect(notice.getAttribute('data-kind')).toBe('conflict');
    expect(screen.getByText('Your editor buffer has not been overwritten.', { exact: false })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Review recovery copy' }));
    expect(harness.setSelectedFile).toHaveBeenCalledWith(filePath);
    await waitFor(() => expect(historyEvent).toHaveBeenCalledTimes(1));
    expect((historyEvent.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({ filePath });

    fireEvent.click(screen.getByRole('button', { name: 'Keep my version' }));
    await waitFor(() => expect(harness.resolveFileSaveConflict).toHaveBeenCalledWith(filePath, 'keep-local'));

    fireEvent.click(screen.getByRole('button', { name: 'Use workspace version' }));
    await waitFor(() => expect(harness.resolveFileSaveConflict).toHaveBeenCalledWith(filePath, 'use-remote'));

    window.removeEventListener('vibecore:open-file-history', historyEvent);
  });

  it('keeps the notice visible and announces an action failure', async () => {
    const filePath = '/home/project/src/App.tsx';
    harness.fileSaveIssues.value = {
      [filePath]: {
        kind: 'conflict',
        filePath,
        localContent: 'local edit',
        remoteContent: 'remote edit',
        detectedAt: 1,
      },
    };
    harness.resolveFileSaveConflict.mockRejectedValueOnce(new Error('remote changed again'));

    renderIn('fr', <FileSaveIssueNotice filePath={filePath} />);
    fireEvent.click(screen.getByRole('button', { name: 'Conserver ma version' }));

    expect(
      (
        await screen.findByText(
          'Le fichier a encore changé ou l’espace de travail est indisponible. Consultez le message actualisé, puis réessayez.',
        )
      ).getAttribute('role'),
    ).toBe('alert');
    expect(screen.getByText('Choisissez la version à conserver — App.tsx')).toBeTruthy();
  });

  it('surfaces the oldest unresolved issue when the selected file is clean', () => {
    const conflicted = '/home/project/src/Conflicted.tsx';
    harness.fileSaveIssues.value = {
      [conflicted]: {
        kind: 'conflict',
        filePath: conflicted,
        localContent: 'local',
        remoteContent: 'remote',
        detectedAt: 1,
      },
      '/home/project/src/Other.tsx': {
        kind: 'error',
        filePath: '/home/project/src/Other.tsx',
        localContent: 'other',
        detectedAt: 2,
      },
    };

    renderIn('en', <FileSaveIssueNotice filePath="/home/project/src/Clean.tsx" />);

    const notice = screen.getByTestId('file-save-issue-notice');
    expect(notice.getAttribute('data-file-path')).toBe(conflicted);
    expect(screen.getByText('Choose which version to keep — Conflicted.tsx')).toBeTruthy();
    expect(screen.getByText('1 other file(s) still need save attention.')).toBeTruthy();
  });

  it('locks responsive wrapping and 44px critical touch targets in the IDE stylesheet', () => {
    const styles = readFileSync('app/styles/index.scss', 'utf8');
    const baseChat = readFileSync('app/components/chat/BaseChat.tsx', 'utf8');
    const start = styles.indexOf('.vc-ide-integrity-notice {');
    const block = styles.slice(start, styles.indexOf('\n.bolt-project-main-panes {', start));

    expect(block).toContain('min-height: 44px');
    expect(block).toContain('@container (max-width: 700px)');
    expect(block).toContain('@media (max-width: 700px)');
    expect(block).toContain('overflow-wrap: anywhere');
    expect(block).toContain(':focus-visible');
    expect(styles).toContain('.bolt-mobile-integrity-stack');
    expect(styles).toContain('container-type: inline-size');
    expect(baseChat).toContain('data-testid="mobile-ide-integrity-stack"');
    expect(baseChat).toContain('<WorkspaceQuotaNotice />');
  });
});
