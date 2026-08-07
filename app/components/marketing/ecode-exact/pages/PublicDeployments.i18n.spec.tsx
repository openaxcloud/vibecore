import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { I18nextProvider } from 'react-i18next';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import PublicDeploymentsPage from './PublicDeploymentsPage';
import PublicDeploymentsSections from './PublicDeploymentsSections';
import { getPublicDeploymentsCopy } from '~/lib/i18n/catalogs/public-deployments';
import { createI18nInstance } from '~/lib/i18n/runtime';

function renderInFrench(node: ReactNode) {
  const router = createMemoryRouter([{ path: '*', element: node }], { initialEntries: ['/deployments?lang=fr'] });
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

describe('public deployments i18n', () => {
  it('uses English for unsupported languages', () => {
    expect(getPublicDeploymentsCopy('de').page.heroTitle).toBe(
      'Launch production-grade apps straight from your workspace',
    );
  });

  it('renders the initial deployment page in French', () => {
    const markup = renderInFrench(<PublicDeploymentsPage />);

    expect(markup).toContain('Lancez des applications de production directement depuis votre espace de travail');
    expect(markup).toContain('Parler à un expert');
    expect(markup).toContain('marketing-site@main');
    expect(markup).not.toContain('Launch production-grade apps straight from your workspace');
  });

  it('renders every deferred deployment section in French', () => {
    const markup = renderInFrench(<PublicDeploymentsSections />);

    expect(markup).toContain('Tout le panneau de déploiement, renforcé pour les équipes de production');
    expect(markup).toContain('Un workflow déjà familier à vos ingénieurs');
    expect(markup).toContain('Vos questions, nos réponses');
    expect(markup).toContain('app.e-code.ai');
    expect(markup).not.toContain('Everything inside the deployment tab, elevated for production teams');
    expect(markup).not.toContain('Questions, answered');
  });
});
