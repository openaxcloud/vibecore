/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('~/components/dashboard/SaaSLayout', () => ({
  PublicShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import { ExploreMarketingPage } from './EcodeExploreGallery';
import { TemplatesMarketingPage, type PublicTemplateCard } from './EcodePublicResourcePages';
import { createI18nInstance } from '~/lib/i18n/runtime';

afterEach(cleanup);

function renderInFrench(node: ReactNode, initialEntry: string) {
  return render(
    <I18nextProvider i18n={createI18nInstance('fr')}>
      <MemoryRouter initialEntries={[initialEntry]}>{node}</MemoryRouter>
    </I18nextProvider>,
  );
}

const template = (
  id: string,
  name: string,
  tags: string[],
  technologies: string[] = ['TypeScript'],
): PublicTemplateCard => ({
  id,
  slug: id,
  name,
  description: `Description ${name}`,
  category: 'web',
  categoryName: 'Applications web',
  difficulty: 'easy',
  featured: true,
  trending: false,
  technologies,
  tags,
  updatedAt: '2026-08-04T00:00:00.000Z',
});

describe('public template taxonomy presentation', () => {
  it('renders localized Explore labels while retaining localized tag search', () => {
    renderInFrench(
      <ExploreMarketingPage
        categories={[{ slug: 'web', name: 'Applications web', count: 1 }]}
        projects={[
          {
            id: 1,
            slug: 'taxonomy-demo',
            name: 'Démo taxonomie',
            description: 'Projet de démonstration',
            language: 'TypeScript',
            category: 'web',
            categoryName: 'Applications web',
            tags: ['frontend', 'dashboard', 'streaming'],
            stars: 1,
            forks: 1,
            runs: 1,
            author: 'E-Code',
          },
        ]}
      />,
      '/explore',
    );

    expect(screen.getByText('Interface utilisateur')).toBeVisible();
    expect(screen.getByText('Tableau de bord')).toBeVisible();
    expect(screen.getByText('Diffusion en continu')).toBeVisible();
    expect(screen.queryByText('frontend')).not.toBeInTheDocument();
    expect(screen.queryByText('dashboard')).not.toBeInTheDocument();
    expect(screen.queryByText('streaming')).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole('textbox', { name: 'Rechercher des projets' }), {
      target: { value: 'diffusion en continu' },
    });

    expect(screen.getByRole('heading', { name: 'Démo taxonomie' })).toBeVisible();
  });

  it('keeps raw template tag IDs in the URL filter while rendering French labels', () => {
    renderInFrench(
      <TemplatesMarketingPage
        categories={[{ slug: 'web', name: 'Applications web', count: 3 }]}
        templates={[
          template('frontend-template', 'Interface moderne', ['frontend']),
          template('dashboard-template', 'Pilotage métier', ['dashboard']),
          template('streaming-template', 'Agent temps réel', ['streaming']),
        ]}
      />,
      '/templates?tag=dashboard',
    );

    const dashboardFilter = screen.getByRole('button', { name: 'Tableau de bord' });

    expect(dashboardFilter).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('heading', { name: 'Pilotage métier' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Interface moderne' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Agent temps réel' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Interface utilisateur' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Diffusion en continu' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'dashboard' })).not.toBeInTheDocument();
  });
});
