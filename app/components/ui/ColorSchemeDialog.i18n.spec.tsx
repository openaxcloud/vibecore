/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@radix-ui/react-popover', () => ({
  Root: ({ children }: { children: ReactNode }) => <>{children}</>,
  Trigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  Portal: ({ children }: { children: ReactNode }) => <>{children}</>,
  Content: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

import { ColorSchemeDialog } from './ColorSchemeDialog';
import { createI18nInstance } from '~/lib/i18n/runtime';

afterEach(cleanup);

describe('ColorSchemeDialog i18n', () => {
  it('renders the complete French palette surface without English control copy', () => {
    render(
      <I18nextProvider i18n={createI18nInstance('fr')}>
        <ColorSchemeDialog triggerVariant="menu" />
      </I18nextProvider>,
    );

    expect(screen.getAllByText('Palette de design').length).toBeGreaterThan(0);
    expect(screen.getByText('Palette de couleurs')).toBeTruthy();
    expect(screen.getByText('Principale')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Caractéristiques' }));

    expect(screen.getByText('Coins arrondis')).toBeTruthy();
    expect(screen.getByText('Annuler')).toBeTruthy();
    expect(screen.getByText('Enregistrer les modifications')).toBeTruthy();
    expect(screen.queryByText('Save changes')).toBeNull();
  });

  it('falls back to English for an unsupported locale', () => {
    render(
      <I18nextProvider i18n={createI18nInstance('es')}>
        <ColorSchemeDialog triggerVariant="menu" />
      </I18nextProvider>,
    );

    expect(screen.getAllByText('Design palette').length).toBeGreaterThan(0);
    expect(screen.getByText('Save changes')).toBeTruthy();
  });
});
