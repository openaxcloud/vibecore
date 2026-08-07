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
});
