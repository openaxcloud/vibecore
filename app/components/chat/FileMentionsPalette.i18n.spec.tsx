/** @vitest-environment jsdom */

import { act, cleanup, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  candidates: [] as Array<{
    absolutePath: string;
    displayPath: string;
    basename: string;
    score: number;
  }>,
}));

vi.mock('~/lib/hooks/useFileMentions', () => ({
  useFileMentions: () => mocks.candidates,
}));

import { FileMentionsPalette } from './FileMentionsPalette';

function createTestI18n() {
  const i18n = createInstance();

  void i18n.use(initReactI18next).init({
    lng: 'fr',
    fallbackLng: 'en',
    resources: { en: { translation: {} }, fr: { translation: {} } },
    initImmediate: false,
  });

  return i18n;
}

afterEach(cleanup);

describe('<FileMentionsPalette /> i18n', () => {
  it('switches empty and accessible labels live', async () => {
    mocks.candidates = [];

    const i18n = createTestI18n();

    render(
      <I18nextProvider i18n={i18n}>
        <FileMentionsPalette query="introuvable" onSelect={vi.fn()} />
      </I18nextProvider>,
    );

    expect(screen.getByRole('listbox', { name: 'Mentions de fichiers' })).toBeTruthy();
    expect(screen.getByText('Aucun fichier correspondant')).toBeTruthy();

    await act(async () => {
      await i18n.changeLanguage('en');
    });

    expect(screen.getByRole('listbox', { name: 'File mentions' })).toBeTruthy();
    expect(screen.getByText('No matching files')).toBeTruthy();
  });

  it('preserves file paths and provides touch-safe options', () => {
    mocks.candidates = [
      {
        absolutePath: '/home/project/src/Écran.tsx',
        displayPath: 'src/Écran.tsx',
        basename: 'Écran.tsx',
        score: 100,
      },
    ];

    const i18n = createTestI18n();

    render(
      <I18nextProvider i18n={i18n}>
        <FileMentionsPalette query="Écran" onSelect={vi.fn()} />
      </I18nextProvider>,
    );

    const option = screen.getByRole('option', { name: /Écran\.tsx/u });

    expect(option.className).toContain('min-h-11');
    expect(screen.getByText('src/Écran.tsx')).toBeTruthy();
  });
});
