/** @vitest-environment jsdom */

import { readFileSync } from 'node:fs';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import type { ReactNode } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('framer-motion', async () => {
  const React = await import('react');
  const motionKeys = ['animate', 'exit', 'initial', 'transition'];

  function createMotionElement(tag: 'div' | 'h3') {
    return (props: Record<string, unknown>) => {
      const domProps = { ...props };

      for (const key of motionKeys) {
        delete domProps[key];
      }

      return React.createElement(tag, domProps);
    };
  }

  return {
    AnimatePresence: ({ children }: { children?: ReactNode }) => React.createElement(React.Fragment, null, children),
    motion: {
      div: createMotionElement('div'),
      h3: createMotionElement('h3'),
    },
    useReducedMotion: () => true,
  };
});

import DeployChatAlert from './DeployAlert';
import { DeploymentTypeSelector } from './DeploymentTypeSelector';
import { formatBuildFailureOutput, getBoltDeployProviders } from './deployUtils';
import { getDeploymentType, getDeploymentTypes } from './deployment-types';
import {
  deployRemainingEn,
  deployRemainingFr,
  formatDeployRemainingCopy,
  getDeployAlertText,
  getDeployRemainingCopy,
  getRepositoryDeployErrorMessage,
  getRepositoryDeployStatusMessage,
} from '~/lib/i18n/catalogs/deploy-remaining';

function createTestI18n(language: 'en' | 'fr' | 'es') {
  const i18n = createInstance();

  void i18n.use(initReactI18next).init({
    lng: language,
    fallbackLng: 'en',
    supportedLngs: ['en', 'fr', 'es'],
    resources: { en: { translation: {} }, fr: { translation: {} }, es: { translation: {} } },
    initImmediate: false,
  });

  return i18n;
}

function renderWithLanguage(language: 'en' | 'fr' | 'es', node: ReactNode) {
  const i18n = createTestI18n(language);

  return {
    i18n,
    ...render(<I18nextProvider i18n={i18n}>{node}</I18nextProvider>),
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('remaining deployment catalog and pure helpers', () => {
  it('keeps flat EN/FR parity, English fallback, interpolation, and safe code lookups', () => {
    expect(Object.keys(deployRemainingFr).sort()).toEqual(Object.keys(deployRemainingEn).sort());
    expect(getDeployRemainingCopy('fr-CA')['deployRemaining.button.deploy']).toBe('Déployer');
    expect(getDeployRemainingCopy('es')['deployRemaining.button.deploy']).toBe('Deploy');
    expect(
      formatDeployRemainingCopy(deployRemainingFr['deployRemaining.button.deployingTo'], { provider: 'GitHub' }),
    ).toBe('Déploiement vers GitHub…');
    expect(getRepositoryDeployErrorMessage('fr', 'github', 'build-failed')).toContain('compilation du projet');
    expect(getRepositoryDeployStatusMessage('fr', 'preparing')).toBe('Préparation du déploiement du dépôt…');
    expect(getDeployAlertText('fr', { type: 'error', stage: 'building', buildStatus: 'failed' })).toEqual({
      title: 'Compilation de votre projet',
      description: 'La compilation du projet a échoué. Consultez la sortie du terminal, puis réessayez.',
    });
  });

  it('localizes deployment models while preserving technical IDs and provider brands', () => {
    const frenchTypes = getDeploymentTypes('fr');
    const frenchProviders = getBoltDeployProviders('fr');

    expect(frenchTypes.map(({ id }) => id)).toEqual(['static', 'autoscale', 'reserved-vm', 'scheduled']);
    expect(frenchTypes.find(({ id }) => id === 'static')?.name).toBe('Statique');
    expect(frenchTypes.find(({ id }) => id === 'reserved-vm')?.requires?.infra).toContain(
      'Routage entrant basé sur l’hôte et TLS',
    );
    expect(getDeploymentType('scheduled', 'fr')?.name).toBe('Planifié');
    expect(getDeploymentType('unknown', 'fr')).toBeUndefined();
    expect(frenchProviders.find(({ id }) => id === 'static')?.name).toBe('Export statique');
    expect(frenchProviders.find(({ id }) => id === 'github-pages')?.name).toBe('GitHub Pages');
    expect(frenchProviders.find(({ id }) => id === 'docker')?.description).toContain('entreprises');
  });

  it('keeps technical build output available only to logging callers and bounds its size', () => {
    const diagnostic = 'token=secret-provider-value';

    expect(formatBuildFailureOutput(diagnostic)).toBe(diagnostic);
    expect(formatBuildFailureOutput('x'.repeat(5000))).toHaveLength(4026);
    expect(formatBuildFailureOutput(undefined)).toBe('Build failed with no output captured.');
  });
});

describe('DeploymentTypeSelector i18n and responsive behavior', () => {
  it('switches French and English live, keeps long labels wrapped, and disables unavailable compute', async () => {
    const onSelect = vi.fn();
    const { i18n } = renderWithLanguage('fr', <DeploymentTypeSelector selected="static" onSelect={onSelect} />);

    expect(screen.getByText('Type de déploiement')).toBeTruthy();
    expect(screen.getByText('Mise à l’échelle automatique')).toBeTruthy();

    const staticTier = screen.getByTestId('deployment-type-static');
    const reservedTier = screen.getByTestId('deployment-type-reserved-vm');

    expect(staticTier.className).toContain('min-h-11');
    expect(staticTier.className).toContain('min-w-0');
    expect(reservedTier).toHaveProperty('disabled', true);
    expect(reservedTier.getAttribute('title')).toContain('infrastructure de calcul managée');

    fireEvent.click(staticTier);
    expect(onSelect).toHaveBeenCalledWith('static');

    await act(async () => {
      await i18n.changeLanguage('en');
    });

    expect(screen.getByText('Deployment type')).toBeTruthy();
    expect(screen.getByText('Autoscale')).toBeTruthy();
    expect(screen.queryByText('Mise à l’échelle automatique')).toBeNull();
  });
});

describe('DeployChatAlert i18n and safe error rendering', () => {
  it('re-resolves copy live and logs raw diagnostics without rendering or forwarding them', async () => {
    const rawDiagnostic = 'upstream token=secret-provider-value request_id=req-42';
    const postMessage = vi.fn();
    const clearAlert = vi.fn();
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const { i18n } = renderWithLanguage(
      'fr',
      <DeployChatAlert
        alert={{
          type: 'error',
          title: `raw title ${rawDiagnostic}`,
          description: `raw description ${rawDiagnostic}`,
          content: rawDiagnostic,
          stage: 'building',
          buildStatus: 'failed',
          deployStatus: 'pending',
          source: 'github',
        }}
        clearAlert={clearAlert}
        postMessage={postMessage}
      />,
    );

    expect(screen.getByText('Compilation de votre projet')).toBeTruthy();
    expect(screen.getByText('Compilation')).toBeTruthy();
    expect(screen.getByText('Déploiement')).toBeTruthy();
    expect(screen.queryByText(new RegExp(rawDiagnostic))).toBeNull();
    expect(JSON.stringify(errorLog.mock.calls)).toContain(rawDiagnostic);

    const askButton = screen.getByRole('button', { name: 'Demander à E-Code' });
    const dismissButton = screen.getByRole('button', { name: 'Fermer' });

    expect(askButton.className).toContain('min-h-11');
    expect(dismissButton.className).toContain('min-h-11');
    fireEvent.click(askButton);
    fireEvent.click(dismissButton);

    expect(postMessage).toHaveBeenCalledWith(
      '*Corrigez cette erreur de déploiement*\n```\nLa compilation du projet a échoué. Consultez la sortie du terminal, puis réessayez.\n```\n',
    );
    expect(JSON.stringify(postMessage.mock.calls)).not.toContain(rawDiagnostic);
    expect(clearAlert).toHaveBeenCalledTimes(1);

    await act(async () => {
      await i18n.changeLanguage('en');
    });

    expect(screen.getByText('Building your project')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeTruthy();
  });

  it('preserves a successful deployment URL behind an accessible 44px action', () => {
    const url = 'https://project.example.com/releases/42';

    renderWithLanguage(
      'fr',
      <DeployChatAlert
        alert={{
          type: 'success',
          title: 'ignored',
          description: 'ignored',
          url,
          stage: 'complete',
          buildStatus: 'complete',
          deployStatus: 'complete',
          source: 'gitlab',
        }}
        clearAlert={vi.fn()}
        postMessage={vi.fn()}
      />,
    );

    const link = screen.getByRole('link', { name: 'Voir le site déployé' });

    expect(link.getAttribute('href')).toBe(url);
    expect(link.className).toContain('min-h-11');
  });
});

describe('remaining deployment source guard', () => {
  it('has zero hardcoded-copy findings in every assigned source file', async () => {
    const { scanSource } = await import('../../../scripts/i18n/source-scanner.mjs');

    const files = [
      'app/components/deploy/DeployButton.tsx',
      'app/components/deploy/GitHubDeploy.client.tsx',
      'app/components/deploy/GitLabDeploy.client.tsx',
      'app/components/deploy/DeployAlert.tsx',
      'app/components/deploy/DeploymentTypeSelector.tsx',
      'app/components/deploy/deployment-types.ts',
      'app/components/deploy/deployUtils.ts',
    ];

    for (const file of files) {
      const result = scanSource(readFileSync(file, 'utf8'), file);

      expect(result.parseErrors, file).toEqual([]);
      expect(result.findings, file).toEqual([]);
    }
  });
});
