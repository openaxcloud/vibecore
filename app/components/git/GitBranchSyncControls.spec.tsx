/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { FormEvent, ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GitBranchSyncControls } from './GitBranchSyncControls';
import { createI18nInstance } from '~/lib/i18n/runtime';

function renderControls(node: ReactNode, language: 'en' | 'fr' = 'en') {
  return render(<I18nextProvider i18n={createI18nInstance(language)}>{node}</I18nextProvider>);
}

describe('<GitBranchSyncControls />', () => {
  afterEach(() => {
    cleanup();
  });

  it('labels pull and push branch fields with explicit context', () => {
    renderControls(<GitBranchSyncControls branch="main" idPrefix="test-git" onSubmit={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Remote Updates' })).toBeTruthy();

    /*
     * Pull and Push must carry explicit, distinct accessible context naming the
     * branch and the direction of the transfer — not just bare "Pull"/"Push".
     */

    const pull = screen.getByRole('button', {
      name: 'Pull remote updates from origin/main into this workspace branch',
    });

    const push = screen.getByRole('button', { name: 'Push local commits to origin/main' });

    expect(pull).toBeTruthy();
    expect(push).toBeTruthy();
    expect(pull.getAttribute('aria-label')).not.toBe(push.getAttribute('aria-label'));
  });

  it('submits the matching Git intent for each action', () => {
    const submittedIntents: Array<FormDataEntryValue | null> = [];

    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      submittedIntents.push(new FormData(event.currentTarget).get('intent'));
    });

    renderControls(<GitBranchSyncControls branch="main" idPrefix="test-git" onSubmit={onSubmit} />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Pull remote updates from origin/main into this workspace branch' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Push local commits to origin/main' }));

    expect(onSubmit).toHaveBeenCalledTimes(2);
    expect(submittedIntents).toEqual(['pull', 'push']);
  });

  it('renders the refresh control with a comfortable hit area, not a bare icon glyph', () => {
    const onRefresh = vi.fn();

    renderControls(
      <GitBranchSyncControls branch="main" idPrefix="test-git" onSubmit={vi.fn()} onRefresh={onRefresh} />,
    );

    const refresh = screen.getByTestId('git-refresh');

    expect(refresh.getAttribute('aria-label')).toBe('Refresh git status');

    /*
     * The clickable element must carry its own sizing/hit-area utilities rather
     * than collapsing to the ~14px icon glyph box; the icon lives in a child span.
     */
    expect(refresh.className).toContain('min-h-11');
    expect(refresh.className).toContain('min-w-11');
    expect(refresh.className).not.toContain('i-ph:arrows-clockwise');
    expect(refresh.querySelector('.i-ph\\:arrows-clockwise')).toBeTruthy();

    fireEvent.click(refresh);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('renders French labels while preserving Git and branch identifiers', () => {
    renderControls(
      <GitBranchSyncControls
        branch="feature/i18n"
        idPrefix="test-git"
        onSubmit={vi.fn()}
        lastFetched="il y a 2 minutes"
        onRefresh={vi.fn()}
      />,
      'fr',
    );

    expect(screen.getByRole('heading', { name: 'Mises à jour distantes' })).toBeTruthy();
    expect(screen.getByText('origin/feature/i18n • upstream')).toBeTruthy();
    expect(screen.getByText('dernière récupération il y a 2 minutes')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Récupérer par pull.*origin\/feature\/i18n/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Envoyer les commits locaux.*origin\/feature\/i18n/ })).toBeTruthy();
    expect(screen.getByText('Synchroniser les modifications')).toBeTruthy();
  });
});
