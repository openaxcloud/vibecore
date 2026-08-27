/**
 * @vitest-environment jsdom
 */

import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import {
  formatProjectCopyPlural,
  formatProjectPromptCost,
  formatProjectUserAreaCurrency,
  formatProjectUserAreaList,
  formatProjectUserAreaNumber,
  getProjectCreationCopy,
  getProjectDeploymentsCopy,
  interpolateProjectCopy,
  projectUserAreaEn,
  projectUserAreaFr,
} from './project-user-area';

import { createI18nInstance } from '~/lib/i18n/runtime';
import ProjectDeploymentsPage from '~/routes/projects.$projectId.deployments';
import NewProjectPage from '~/routes/projects.new';

vi.mock('~/lib/stores/settings', async () => {
  const { atom } = await import('nanostores');

  return { providersStore: atom({}) };
});

function flattenStrings(value: unknown, path = ''): Map<string, string> {
  const entries = new Map<string, string>();

  if (typeof value === 'string') {
    entries.set(path, value);
    return entries;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      for (const [key, text] of flattenStrings(item, `${path}.${index}`)) {
        entries.set(key, text);
      }
    });
    return entries;
  }

  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      for (const [childKey, text] of flattenStrings(item, path ? `${path}.${key}` : key)) {
        entries.set(childKey, text);
      }
    }
  }

  return entries;
}

function interpolationTokens(value: string): string[] {
  return [...value.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu)].map((match) => match[1]).sort();
}

function renderRouteInFrench({
  id,
  path,
  node,
  loaderData,
}: {
  id: string;
  path: string;
  node: ReactNode;
  loaderData: unknown;
}): string {
  const router = createMemoryRouter([{ id, path, element: node }], {
    initialEntries: [path.replace(':projectId', 'project_1')],
    hydrationData: { loaderData: { [id]: loaderData } },
  });

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

describe('project creation and deployment catalogs', () => {
  it('keeps every English and French path and interpolation token in exact parity', () => {
    const english = flattenStrings(projectUserAreaEn);
    const french = flattenStrings(projectUserAreaFr);

    expect(english.size).toBe(304);
    expect([...french.keys()].sort()).toEqual([...english.keys()].sort());

    for (const [key, englishValue] of english) {
      expect(interpolationTokens(french.get(key) ?? ''), key).toEqual(interpolationTokens(englishValue));
    }

    const creationEn = projectUserAreaEn.projectUserArea.creation;
    const creationFr = projectUserAreaFr.projectUserArea.creation;
    expect(Object.keys(creationFr.artifacts).sort()).toEqual(Object.keys(creationEn.artifacts).sort());

    for (const artifact of Object.keys(creationEn.artifacts) as Array<keyof typeof creationEn.artifacts>) {
      expect(creationFr.artifacts[artifact].prompts, artifact).toHaveLength(
        creationEn.artifacts[artifact].prompts.length,
      );
    }
  });

  it('uses French variants and falls back safely to English for unsupported locales', () => {
    expect(getProjectCreationCopy('fr-CA').heroTitle).toBe('Que souhaitez-vous créer ?');
    expect(getProjectDeploymentsCopy('fr-FR').actions.redeploy).toBe('Redéployer');
    expect(getProjectCreationCopy('de-DE').heroTitle).toBe('What do you want to build?');
    expect(getProjectDeploymentsCopy(undefined).actions.redeploy).toBe('Redeploy');
  });

  it('enforces the reviewed French glossary across project creation and deployment copy', () => {
    const residualEnglishTerminology =
      /\b(?:preview|logs?|marketplace|snapshots?|packages?|builds?|workspace|runtime|stack|starter|typecheck|full-stack|tenants|tokens?|tags?|design system|backend|frontend|fork|feature flags?)\b/iu;

    for (const [path, copy] of flattenStrings(projectUserAreaFr)) {
      const visibleStaticCopy = copy.replace(/\{[A-Za-z_][A-Za-z0-9_]*\}/gu, '');
      expect(visibleStaticCopy, path).not.toMatch(residualEnglishTerminology);
    }
  });

  it('interpolates, pluralizes and formats French values without converting technical data', () => {
    const copy = getProjectDeploymentsCopy('fr');

    expect(interpolateProjectCopy(copy.row.rollbackTitle, { deploymentId: 'dep_42' })).toBe(
      'Créé en rétablissant le déploiement dep_42',
    );
    expect(formatProjectCopyPlural('fr', 2, { one: copy.logs.line_one, other: copy.logs.line_other })).toBe('2 lignes');
    expect(formatProjectUserAreaNumber(12_345.6, 'fr')).toBe('12 345,6');
    expect(formatProjectUserAreaCurrency(0.15, 'USD', 'fr', 3)).toBe('0,150 $US');
    expect(formatProjectPromptCost(0.001, 'fr')).toBe('moins de 0,01 $US');
    expect(formatProjectUserAreaList(['violence', 'harcèlement'], 'fr')).toBe('violence et harcèlement');
  });

  it('renders the complete French project-creation surface, including localized examples', () => {
    const html = renderRouteInFrench({
      id: 'projects-new',
      path: '/projects/new',
      node: <NewProjectPage />,
      loaderData: {
        modelList: [],
        providers: [],
        defaultProvider: { name: 'OpenAI', staticModels: [] },
        initialPrompt: '',
      },
    });

    expect(html).toContain('Que souhaitez-vous créer ?');
    expect(html).toContain('Visualisation de données');
    expect(html).toContain('Créez un tableau de bord SaaS');
    expect(html).toContain('Partir du catalogue existant');
    expect(html).not.toContain('What do you want to build?');
    expect(html).not.toContain('Start from the existing catalog');
  });

  it('renders French deployments and the localized trans-component sub-navigation', () => {
    const html = renderRouteInFrench({
      id: 'project-deployments',
      path: '/projects/:projectId/deployments',
      node: <ProjectDeploymentsPage />,
      loaderData: { project: { id: 'project_1' }, data: { deployments: [] } },
    });

    expect(html).toContain('Déploiements');
    expect(html).toContain('Vue d’ensemble');
    expect(html).toContain('Domaines');
    expect(html).toContain('Modifier les paramètres');
    expect(html).toContain('Détection du mode de déploiement');
    expect(html).not.toContain('Adjust settings');
    expect(html).not.toContain('Deployment views');
  });
});
