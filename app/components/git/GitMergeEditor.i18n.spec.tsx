/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GitMergeEditor } from './GitMergeEditor';
import { createI18nInstance } from '~/lib/i18n/runtime';

const CONFLICT = ['avant', '<<<<<<< HEAD', 'version actuelle', '=======', 'version entrante', '>>>>>>> main'].join(
  '\n',
);

afterEach(cleanup);

describe('<GitMergeEditor /> i18n', () => {
  it('renders professional French copy and preserves the file path and source content', () => {
    render(
      <I18nextProvider i18n={createI18nInstance('fr')}>
        <GitMergeEditor filePath="src/app.ts" content={CONFLICT} onResolve={vi.fn()} onCancel={vi.fn()} />
      </I18nextProvider>,
    );

    expect(screen.getByText('src/app.ts')).toBeTruthy();
    expect(screen.getByText('1 conflit')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Accepter la version actuelle' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Accepter la version entrante' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Accepter les deux' })).toBeTruthy();
    expect(screen.getByText('version actuelle')).toBeTruthy();
    expect(screen.getByText('version entrante')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Fermer l’éditeur de fusion' }).className).toContain('min-h-11');
  });

  it('localizes raw editing and only enables resolution after conflict markers are removed', () => {
    const onResolve = vi.fn();

    render(
      <I18nextProvider i18n={createI18nInstance('fr')}>
        <GitMergeEditor filePath="src/app.ts" content={CONFLICT} onResolve={onResolve} onCancel={vi.fn()} />
      </I18nextProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Modifier le contenu brut' }));

    const textarea = screen.getByRole('textbox', { name: 'Résultat brut de la fusion' });
    const resolve = screen.getByRole('button', { name: 'Marquer comme résolu' });

    expect(screen.getByText('Supprimez tous les marqueurs de conflit avant de valider.')).toBeTruthy();
    expect((resolve as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(textarea, { target: { value: 'contenu résolu' } });
    expect(screen.getByText('Prêt à marquer comme résolu.')).toBeTruthy();
    expect((resolve as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(resolve);
    expect(onResolve).toHaveBeenCalledWith('contenu résolu');
  });
});
