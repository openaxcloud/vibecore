import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { I18nextProvider } from 'react-i18next';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { getMarketingProductRemainingCopy } from './marketing-product-remaining';
import { getMarketingPublicResourceCopy } from './marketing-public-resource';
import { getMarketingSurfaceCopy } from './marketing-surface';
import {
  EcodeDeploymentsPage,
  EcodeFeaturesPage,
  EcodeMobilePage,
} from '~/components/marketing/EcodeProductMarketingPages';
import { CommunityMarketingPage, TemplatesMarketingPage } from '~/components/marketing/EcodePublicResourcePages';
import {
  createProjectImportSurfacePage,
  EcodeSurfacePage,
  ecodeSurfacePages,
} from '~/components/marketing/EcodeSurfacePages';
import { createI18nInstance } from '~/lib/i18n/runtime';

function renderInFrench(node: ReactNode) {
  const router = createMemoryRouter([{ path: '*', element: node }], { initialEntries: ['/'] });
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

  try {
    return renderToStaticMarkup(
      <I18nextProvider i18n={createI18nInstance('fr')}>
        <RouterProvider router={router} />
      </I18nextProvider>,
    );
  } finally {
    consoleError.mockRestore();
  }
}

describe('remaining marketing EN/FR catalogs', () => {
  it('falls back to English and resolves professional French copy', () => {
    expect(getMarketingProductRemainingCopy('de').features.heroTitle).toBe('Features that empower developers');
    expect(getMarketingProductRemainingCopy('fr').deployments.expert).toBe('Parler à un expert');
    expect(getMarketingPublicResourceCopy('fr').templates.card.useTemplate).toBe('Utiliser ce modèle');
    expect(getMarketingSurfaceCopy('fr').categories.builder.primaryAction[0]).toBe('Créer un projet');
  });

  it('renders product feature, mobile and deployment slices in French', () => {
    const features = renderInFrench(<EcodeFeaturesPage />);
    const mobile = renderInFrench(<EcodeMobilePage />);
    const deployments = renderInFrench(<EcodeDeploymentsPage />);

    expect(features).toContain('Des fonctionnalités qui donnent plus de pouvoir aux développeurs');
    expect(features).not.toContain('Features that empower developers');
    expect(mobile).toContain('Tout l’espace de travail E-Code, désormais sur mobile');
    expect(mobile).not.toContain('Build from anywhere');
    expect(deployments).toContain('Choisissez le bon mode de déploiement');
    expect(deployments).not.toContain('Choose the right deployment mode');
  });

  it('renders public resource chrome in French', () => {
    const templates = renderInFrench(<TemplatesMarketingPage categories={[]} templates={[]} />);

    const community = renderInFrench(
      <CommunityMarketingPage posts={[]} categories={[]} challenges={[]} contributors={[]} events={[]} />,
    );

    expect(templates).toContain('Démarrez plus vite avec des modèles E-Code prêts pour la production');
    expect(templates).not.toContain('Start faster with production-ready E-Code templates');
    expect(community).toContain('Aucune discussion publique trouvée');
    expect(community).not.toContain('No public discussions found');
  });

  it('localizes shared Surface category and navigation chrome', () => {
    const surface = renderInFrench(<EcodeSurfacePage page={ecodeSurfacePages.new} />);

    expect(surface).toContain('Surface de création');
    expect(surface).toContain('Créer un projet');
    expect(surface).toContain('Routes associées');
    expect(surface).not.toContain('Builder surface');
    expect(surface).not.toContain('Connected routes');
  });

  it('localizes parameterized compatibility content without translating identifiers', () => {
    const surface = renderInFrench(<EcodeSurfacePage page={createProjectImportSurfacePage('projet-42', 'bolt')} />);

    expect(surface).toContain('Importation de projet Export historique');
    expect(surface).toContain('Correspondance de la source Export historique');
    expect(surface).toContain('projet-42');
    expect(surface).not.toContain('Legacy export Project Import');
    expect(surface).not.toContain('Project context');
  });
});
