/**
 * @vitest-environment jsdom
 */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DiffActionRow } from './DiffActionRow';
import { createI18nInstance } from '~/lib/i18n/runtime';
import type { DiffApplyMeta } from '~/types/actions';

afterEach(() => cleanup());

function renderRow(props: React.ComponentProps<typeof DiffActionRow>, language: 'en' | 'fr' = 'en') {
  const i18n = createI18nInstance(language);

  const result = render(
    <I18nextProvider i18n={i18n}>
      <DiffActionRow {...props} />
    </I18nextProvider>,
  );

  return { ...result, i18n };
}

describe('DiffActionRow — chat-UI render surface for a diff action', () => {
  it('labels the edit as a targeted patch and opens the file on click', () => {
    const onOpenFile = vi.fn();
    renderRow({ filePath: 'src/BigComponent.tsx', onOpenFile });

    expect(screen.getByText('Edit')).toBeTruthy();
    expect(screen.getByText('(targeted patch)')).toBeTruthy();

    const code = screen.getByText('src/BigComponent.tsx');
    expect(code).toBeTruthy();

    fireEvent.click(code);
    expect(onOpenFile).toHaveBeenCalledWith('src/BigComponent.tsx');
  });

  it('shows a +N/−M hunk pill on a successful apply', () => {
    const diffApply: DiffApplyMeta = {
      status: 'applied',
      blockCount: 2,
      addedLines: 5,
      removedLines: 3,
      hunkCount: 2,
    };

    const { container } = renderRow({ filePath: 'src/big.ts', diffApply });

    expect(screen.getByText('+5')).toBeTruthy();
    expect(screen.getByText('−3')).toBeTruthy();

    // Reuses the shared file-proposal diff pill classes (no parallel viewer).
    expect(container.querySelector('.bolt-file-action-diff-added')).toBeTruthy();
    expect(container.querySelector('.bolt-file-action-diff-removed')).toBeTruthy();

    // No failure marker on success.
    expect(screen.queryByText('Could not apply')).toBeNull();
  });

  it('shows a "Could not apply" marker on a fail-safe fallback (never silent)', () => {
    const diffApply: DiffApplyMeta = {
      status: 'failed',
      blockCount: 0,
      addedLines: 0,
      removedLines: 0,
      hunkCount: 0,
      failureKind: 'apply-failed',
    };

    renderRow({ filePath: 'src/answer.ts', diffApply });

    expect(screen.getByText('Could not apply')).toBeTruthy();

    // The path is still visible — the action is never silently absent.
    expect(screen.getByText('src/answer.ts')).toBeTruthy();

    // No +N/−M pill when nothing applied.
    expect(screen.queryByText(/^\+/)).toBeNull();
  });

  it('renders the label with no pill while streaming (diffApply undefined)', () => {
    renderRow({ filePath: 'src/x.ts' });

    expect(screen.getByText('Edit')).toBeTruthy();
    expect(screen.getByText('src/x.ts')).toBeTruthy();
    expect(screen.queryByText('Could not apply')).toBeNull();
  });

  it('renders professional French copy, localized plurals, and switches live without changing the path', async () => {
    const diffApply: DiffApplyMeta = {
      status: 'applied',
      blockCount: 2,
      addedLines: 1,
      removedLines: 2,
      hunkCount: 2,
    };

    const { i18n } = renderRow({ filePath: 'src/BigComponent.tsx', diffApply }, 'fr');

    expect(screen.getByText('Modifier')).toBeTruthy();
    expect(screen.getByText('(patch ciblé)')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ouvrir src/BigComponent.tsx' })).toBeTruthy();
    expect(screen.getByLabelText('1 ligne ajoutée ; 2 lignes supprimées')).toBeTruthy();

    await act(async () => {
      await i18n.changeLanguage('en');
    });

    expect(screen.getByText('Edit')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open src/BigComponent.tsx' })).toBeTruthy();
  });
});
