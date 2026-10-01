/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ChatAlert from './ChatAlert';
import { createI18nInstance } from '~/lib/i18n/runtime';

afterEach(cleanup);

describe('<ChatAlert /> i18n', () => {
  it('localizes the preview wrapper while preserving technical output', () => {
    const postMessage = vi.fn();

    render(
      <I18nextProvider i18n={createI18nInstance('fr')}>
        <ChatAlert
          alert={{
            type: 'error',
            title: 'Raw preview title',
            description: 'ReferenceError: window is not defined',
            content: 'const app = window.app;',
            source: 'preview',
          }}
          clearAlert={vi.fn()}
          postMessage={postMessage}
        />
      </I18nextProvider>,
    );

    expect(screen.getByRole('alert').getAttribute('aria-label')).toBe('Erreur d’aperçu');
    expect(screen.getByText(/Une erreur est survenue pendant l’exécution de l’aperçu/)).toBeTruthy();
    expect(screen.getByText('ReferenceError: window is not defined')).toBeTruthy();
    expect(screen.queryByText('Raw preview title')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Demander à l’agent' }));
    expect(postMessage).toHaveBeenCalledWith('*Corrige cette erreur d’aperçu*\n```js\nconst app = window.app;\n```\n');
  });

  it('localizes terminal actions and dismisses the alert', () => {
    const clearAlert = vi.fn();

    render(
      <I18nextProvider i18n={createI18nInstance('fr')}>
        <ChatAlert
          alert={{ type: 'error', title: '', description: '', content: 'npm test', source: 'terminal' }}
          clearAlert={clearAlert}
          postMessage={vi.fn()}
        />
      </I18nextProvider>,
    );

    expect(screen.getByRole('alert').getAttribute('aria-label')).toBe('Erreur du terminal');
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(clearAlert).toHaveBeenCalledTimes(1);
  });

  /*
   * UNE INFORMATION N'EST PAS UNE ERREUR D'APERÇU. Mesuré en production le
   * 2026-10-01 à 16:49 (projet cmuprp…, #667 servi) : l'utilisateur enregistre
   * pendant que l'agent modifie les mêmes lignes ; sa version est gardée et la
   * modification de l'agent attend sa revue. L'alerte affichait « Erreur
   * d'aperçu — Une erreur est survenue pendant l'exécution de l'aperçu. E-Code
   * peut l'analyser » et un bouton « Demander à l'agent » : un faux problème, et
   * une invitation à faire « corriger » par l'agent ce que l'utilisateur venait
   * de garder. Sept avertissements du moteur passaient par là (fichier
   * verrouillé, écriture bloquée, conflit, arrêt de réparation, import invalide,
   * diff non appliqué). Leurs titres sont traduits par le moteur : on les montre.
   */
  it('un AVERTISSEMENT du moteur montre son propre titre et son message — pas une « erreur d’aperçu »', () => {
    render(
      <I18nextProvider i18n={createI18nInstance('fr')}>
        <ChatAlert
          alert={{
            type: 'warning',
            title: 'Votre modification est conservée',
            description: 'Vous avez enregistré src/App.tsx pendant que l’agent modifiait les mêmes lignes.',
            content: 'Vous avez enregistré src/App.tsx pendant que l’agent modifiait les mêmes lignes.',
            source: 'preview',
          }}
          clearAlert={vi.fn()}
          postMessage={vi.fn()}
        />
      </I18nextProvider>,
    );

    expect(screen.getByRole('alert').getAttribute('aria-label')).toBe('Votre modification est conservée');
    expect(screen.getByText(/pendant que l’agent modifiait les mêmes lignes/)).toBeTruthy();
    expect(screen.queryByText(/Erreur d’aperçu|pendant l’exécution de l’aperçu/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Demander à l’agent' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Fermer' })).toBeTruthy();
  });
});
