/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { EcodeExactPublicFooter, EcodeExactPublicNavbar } from './EcodeExactShell';
import { createI18nInstance } from '~/lib/i18n/runtime';

afterEach(cleanup);

describe('exact marketing shell locale inheritance', () => {
  it('renders standalone navbar and footer calls from the active French i18n locale', () => {
    const router = createMemoryRouter(
      [
        {
          path: '/',
          element: (
            <>
              <EcodeExactPublicNavbar />
              <EcodeExactPublicFooter />
            </>
          ),
        },
      ],
      { initialEntries: ['/'] },
    );

    render(
      <I18nextProvider i18n={createI18nInstance('fr')}>
        <RouterProvider router={router} />
      </I18nextProvider>,
    );

    expect(screen.getAllByText('Produit').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Tarifs').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Se connecter' })).toBeInTheDocument();
    expect(screen.getByText('Créez des logiciels inspectables avec votre équipe')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'S’inscrire' })).toBeInTheDocument();
    expect(screen.queryByText('Pricing')).not.toBeInTheDocument();
    expect(screen.queryByText('Build inspectable software with your team')).not.toBeInTheDocument();
  });
});
