/** @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it } from 'vitest';

import { RepositoryStats } from './RepositoryStats';
import { createI18nInstance } from '~/lib/i18n/runtime';

afterEach(cleanup);

describe('<RepositoryStats /> i18n', () => {
  it('formats French labels, numbers, sizes and overflow counts while preserving language names', () => {
    render(
      <I18nextProvider i18n={createI18nInstance('fr')}>
        <RepositoryStats
          stats={{
            totalFiles: 1234,
            totalSize: 1536,
            languages: { TypeScript: 1024, CSS: 512, HTML: 256, Rust: 128, Go: 64, Python: 32 },
            hasPackageJson: true,
            hasDependencies: true,
          }}
        />
      </I18nextProvider>,
    );

    expect(screen.getByText('Statistiques du dépôt')).toBeTruthy();
    expect(screen.getByText(/Nombre total de fichiers\s*:\s*1[\s\u202f]234/u)).toBeTruthy();
    expect(screen.getByText(/Taille totale\s*:\s*1,5\s*Ko/u)).toBeTruthy();
    expect(
      screen.getByText((_, element) => element?.textContent?.replace(/\s/gu, ' ') === 'TypeScript (1,0 Ko)'),
    ).toBeTruthy();
    expect(screen.getByText('+1 autre')).toBeTruthy();
    expect(screen.getByText('package.json')).toBeTruthy();
    expect(screen.getByText('Dépendances')).toBeTruthy();
  });
});
