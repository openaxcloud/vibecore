/** @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BinaryContent } from '~/components/editor/codemirror/BinaryContent';
import { Breadcrumbs } from '~/components/ui/Breadcrumbs';
import { SearchInput } from '~/components/ui/SearchInput';
import { HelpButton, SettingsButton } from '~/components/ui/SettingsButton';
import { createI18nInstance } from '~/lib/i18n/runtime';

afterEach(cleanup);

function renderFrench(node: ReactNode) {
  return render(<I18nextProvider i18n={createI18nInstance('fr')}>{node}</I18nextProvider>);
}

describe('shared UI residual i18n', () => {
  it('localizes editor, settings, help, breadcrumb and search affordances', () => {
    renderFrench(
      <>
        <BinaryContent />
        <SettingsButton onClick={vi.fn()} />
        <HelpButton onClick={vi.fn()} />
        <Breadcrumbs items={[{ label: 'main' }]} />
        <SearchInput value="requête" onChange={vi.fn()} onClear={vi.fn()} />
      </>,
    );

    expect(screen.getByText('Les fichiers binaires ne peuvent pas être prévisualisés dans l’éditeur.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Paramètres' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Aide et documentation' })).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Fil d’Ariane' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Effacer la recherche' }).className).toContain('min-h-11');
    expect(screen.getByText('main')).toBeTruthy();
  });
});
