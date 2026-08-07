/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./Artifact', () => ({
  Artifact: () => null,
  openArtifactInWorkbench: vi.fn(),
}));

vi.mock('./CodeBlock', () => ({
  CodeBlock: ({ code }: { code: string }) => <pre>{code}</pre>,
}));

vi.mock('./MermaidBlock', () => ({
  MermaidBlock: ({ code }: { code: string }) => <pre>{code}</pre>,
}));

import { Markdown } from './Markdown';

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

describe('<Markdown /> residual i18n', () => {
  it('localizes thought chrome live without translating assistant-authored markdown', async () => {
    const i18n = createTestI18n();

    render(
      <I18nextProvider i18n={i18n}>
        <Markdown html>{'<div class="__boltThought__">Détail du raisonnement SQL</div>'}</Markdown>
      </I18nextProvider>,
    );

    const toggle = screen.getByRole('button', { name: 'Développer Raisonnement' });

    expect(toggle.className).toContain('min-h-11');
    fireEvent.click(toggle);
    expect(screen.getByText('Détail du raisonnement SQL')).toBeTruthy();

    await act(async () => {
      await i18n.changeLanguage('en');
    });

    expect(screen.getByRole('button', { name: 'Collapse Thought process' })).toBeTruthy();
    expect(screen.getByText('Détail du raisonnement SQL')).toBeTruthy();
  });
});
