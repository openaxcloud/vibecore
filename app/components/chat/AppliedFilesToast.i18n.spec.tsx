/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppliedFilesToast } from './AppliedFilesToast';
import { createI18nInstance } from '~/lib/i18n/runtime';

afterEach(cleanup);

describe('<AppliedFilesToast /> i18n', () => {
  it('renders French copy, localized plurals, and preserves file paths', () => {
    const onUndoAll = vi.fn();
    const onDismissAll = vi.fn();
    const files = Array.from({ length: 10 }, (_, index) => `src/fichier-${index + 1}.tsx`);

    render(
      <I18nextProvider i18n={createI18nInstance('fr')}>
        <AppliedFilesToast files={files} onUndoAll={onUndoAll} onDismissAll={onDismissAll} />
      </I18nextProvider>,
    );

    expect(screen.getByText('10 fichiers appliqués')).toBeTruthy();
    expect(screen.getByText('Les patchs de l’agent ont bien été appliqués.')).toBeTruthy();
    expect(screen.getByText('2 fichiers supplémentaires')).toBeTruthy();
    expect(screen.getByText('src/fichier-1.tsx')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Tout annuler' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tout fermer' }));

    expect(onUndoAll).toHaveBeenCalledTimes(1);
    expect(onDismissAll).toHaveBeenCalledTimes(1);
  });

  it('switches copy live and uses the singular form', async () => {
    const i18n = createI18nInstance('fr');

    render(
      <I18nextProvider i18n={i18n}>
        <AppliedFilesToast files={['src/App.tsx']} onUndoAll={vi.fn()} onDismissAll={vi.fn()} />
      </I18nextProvider>,
    );

    expect(screen.getByText('1 fichier appliqué')).toBeTruthy();

    await act(async () => {
      await i18n.changeLanguage('en');
    });

    expect(screen.getByText('1 file applied')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Undo all' })).toBeTruthy();
  });
});
