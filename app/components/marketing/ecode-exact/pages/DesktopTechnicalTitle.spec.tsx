import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import Desktop from './Desktop';
import { createI18nInstance } from '~/lib/i18n/runtime';

describe('desktop technical window title', () => {
  it('retains the project identifier and marks only that title outside the translation audit', () => {
    const router = createMemoryRouter([{ path: '*', element: <Desktop /> }], { initialEntries: ['/desktop'] });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const markup = renderToStaticMarkup(
        <I18nextProvider i18n={createI18nInstance('fr')}>
          <RouterProvider router={router} />
        </I18nextProvider>,
      );

      expect(markup).toContain('data-i18n-audit-ignore="true">E-Code — todo-app</span>');
      expect(markup).toContain('E-Code — Gestion de versions</span>');
      expect(markup).not.toContain('data-i18n-audit-ignore="true">E-Code — Gestion de versions');
    } finally {
      consoleError.mockRestore();
    }
  });
});
