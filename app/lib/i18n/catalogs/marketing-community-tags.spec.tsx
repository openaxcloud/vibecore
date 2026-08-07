/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { CommunityMarketingPage } from '~/components/marketing/EcodePublicResourcePages';
import { createI18nInstance } from '~/lib/i18n/runtime';
import { buildCommunityRouteData } from '~/routes/community';

afterEach(cleanup);

describe('community tag labels', () => {
  it('renders localized labels while retaining search by the machine tag', () => {
    const data = buildCommunityRouteData('fr');

    const router = createMemoryRouter(
      [
        {
          path: '*',
          element: (
            <CommunityMarketingPage
              posts={data.posts}
              categories={data.categories}
              challenges={data.challenges}
              contributors={data.contributors}
              events={data.events}
            />
          ),
        },
      ],
      { initialEntries: ['/community'] },
    );

    render(
      <I18nextProvider i18n={createI18nInstance('fr')}>
        <RouterProvider router={router} />
      </I18nextProvider>,
    );

    expect(screen.getByText('Aperçu')).toBeVisible();
    expect(screen.queryByText('preview')).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId('input-search-community'), { target: { value: 'preview' } });

    expect(
      screen.getByRole('link', { name: 'Liste de contrôle de l’aperçu mobile avant l’envoi en assurance qualité' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('link', {
        name: 'Guide de retour arrière d’un déploiement de production pour les petites équipes',
      }),
    ).not.toBeInTheDocument();
    expect(data.posts.find((post) => post.id === 'mobile-preview-checklist')?.tags).toContain('preview');
  });
});
