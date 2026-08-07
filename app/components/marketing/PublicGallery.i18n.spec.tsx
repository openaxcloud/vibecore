/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('~/components/dashboard/SaaSLayout', () => ({
  PublicShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import { ExploreMarketingPage } from './EcodeExploreGallery';
import { createI18nInstance } from '~/lib/i18n/runtime';
import GalleryIndexRoute from '~/routes/gallery._index';

function inFrench(node: ReactNode) {
  return <I18nextProvider i18n={createI18nInstance('fr')}>{node}</I18nextProvider>;
}

afterEach(cleanup);

describe('public galleries i18n', () => {
  it('renders Explore search, metrics, cards, plurals, and empty state in French', () => {
    render(
      inFrench(
        <MemoryRouter initialEntries={['/explore']}>
          <ExploreMarketingPage
            categories={[{ slug: 'web', name: 'Applications web', count: 1 }]}
            projects={[
              {
                id: 1,
                slug: 'react-saas',
                name: 'SaaS React',
                description: 'Modèle SaaS de production',
                language: 'TypeScript',
                category: 'web',
                categoryName: 'Applications web',
                tags: ['react'],
                stars: 1,
                forks: 2,
                runs: 3,
                author: 'E-Code',
              },
            ]}
          />
        </MemoryRouter>,
      ),
    );

    expect(screen.getByRole('heading', { name: 'Découvrez ce que crée la communauté E-Code' })).toBeTruthy();
    expect(screen.getByText('Projets publics')).toBeTruthy();
    expect(screen.getByPlaceholderText('Rechercher des projets, piles techniques ou étiquettes…')).toBeTruthy();
    expect(screen.getByText('par E-Code')).toBeTruthy();
    expect(screen.getByTitle('1 étoile')).toBeTruthy();
    expect(screen.getByTitle('2 copies')).toBeTruthy();

    fireEvent.change(screen.getByRole('textbox', { name: 'Rechercher des projets' }), {
      target: { value: 'introuvable' },
    });

    expect(screen.getByText(/Aucun projet ne correspond à/u).textContent).toContain('introuvable');
    expect(screen.queryByText(/No projects/u)).toBeNull();
  });

  it('renders the database-backed Gallery route in French with localized accessibility copy', async () => {
    const galleryData = {
      results: [
        {
          id: 'gallery-1',
          slug: 'outil-public',
          title: 'Outil public',
          description: 'Contenu publié par un membre',
          category: 'web',
          tags: ['react'],
          featured: true,
          author: 'octocat',
          appUrl: null,
          thumbnailUrl: 'https://images.example.test/gallery.png',
          views: 1_234,
          uses: 1,
        },
      ],
      total: 1,
      categories: [{ id: 'web', count: 1 }],
      activeCategory: 'all',
      query: '',
      language: 'fr',
    };

    const router = createMemoryRouter(
      [
        {
          id: 'gallery',
          path: '/gallery',
          element: <GalleryIndexRoute />,
        },
      ],
      {
        initialEntries: ['/gallery'],
        hydrationData: { loaderData: { gallery: galleryData } },
      },
    );

    render(inFrench(<RouterProvider router={router} />));

    expect(
      await screen.findByRole('heading', {
        name: 'Les applications de la communauté — remixez-en une pour commencer',
      }),
    ).toBeTruthy();
    expect(screen.getByRole('searchbox', { name: 'Rechercher dans la galerie' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Rechercher' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Catégories' })).toBeTruthy();
    expect(screen.getByText('À la une')).toBeTruthy();
    expect(screen.getByText('par octocat')).toBeTruthy();
    expect(screen.getByAltText('Aperçu de Outil public')).toBeTruthy();
    expect(screen.getByTitle(/1[\s\u202f]234 vues/u)).toBeTruthy();
    expect(screen.queryByText('Featured')).toBeNull();
  });
});
