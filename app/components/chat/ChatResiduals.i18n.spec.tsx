/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import type { ReactNode } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GenerateAppCta } from './GenerateAppCta';
import { PlanChecklistView } from './PlanChecklist';
import ProgressCompilation from './ProgressCompilation';
import ThoughtBox from './ThoughtBox';
import { ConnectionFailedNote } from './connector-cards/ConnectionFailedNote';
import { ConnectionResolvedNote } from './connector-cards/ConnectionResolvedNote';
import type { PlanChecklist } from '~/lib/chat/plan-checklist';
import type { FileMap } from '~/lib/stores/files';

function renderLocalized(node: ReactNode, language: 'en' | 'fr' = 'fr') {
  const i18n = createInstance();

  void i18n.use(initReactI18next).init({
    lng: language,
    fallbackLng: 'en',
    supportedLngs: ['en', 'fr'],
    resources: { en: { translation: {} }, fr: { translation: {} } },
    initImmediate: false,
  });

  return {
    ...render(<I18nextProvider i18n={i18n}>{node}</I18nextProvider>),
    i18n,
  };
}

const readmeOnlyProject: FileMap = {
  '/home/project/README.md': {
    type: 'file',
    content: 'This project was created from an AI prompt.\n\nPrompt:\n\nCréer un portail de facturation.',
    isBinary: false,
  },
};

const plan: PlanChecklist = {
  title: 'Plan de migration',
  items: [
    { id: 'schema', description: 'Vérifier le schéma', status: 'completed' },
    { id: 'tests', description: 'Exécuter les tests', status: 'in_progress' },
  ],
};

afterEach(cleanup);

describe('remaining chat surfaces i18n', () => {
  it('switches shared chat chrome live while preserving project, provider, account, and plan content', async () => {
    const onGenerate = vi.fn();

    const { i18n } = renderLocalized(
      <>
        <GenerateAppCta files={readmeOnlyProject} hasMessages={false} isGenerating={false} onGenerate={onGenerate} />
        <ProgressCompilation
          data={[
            {
              type: 'progress',
              label: 'response',
              status: 'in-progress',
              order: 0,
              message: 'Generating Response',
            },
          ]}
        />
        <PlanChecklistView plan={plan} />
        <ThoughtBox title="Analyse du schéma">
          <span>SELECT * FROM invoices</span>
        </ThoughtBox>
        <ConnectionFailedNote
          payload={{
            kind: 'connection_failed',
            messageId: 'failure',
            provider: 'github',
            providerDisplayName: 'GitHub',
            reason: 'scope_mismatch',
            detail: 'Raw upstream scope failure secret=123',
          }}
        />
        <ConnectionResolvedNote
          payload={{
            kind: 'connection_resolved',
            messageId: 'resolved',
            provider: 'github',
            providerDisplayName: 'GitHub',
            accountLabel: 'avi@example.test',
            userConnectionId: 'connection-1',
          }}
        />
      </>,
    );

    const generateButton = screen.getByRole('button', { name: 'Générer l’application' });

    expect(screen.getByText('Ce projet n’a pas encore été généré')).toBeTruthy();
    expect(generateButton.className).toContain('min-h-11');
    fireEvent.click(generateButton);
    expect(onGenerate).toHaveBeenCalledWith('Créer un portail de facturation.');

    expect(screen.getByRole('status', { name: /Génération de la réponse/u })).toBeTruthy();
    expect(screen.queryByText('Generating Response')).toBeNull();

    const planRegion = screen.getByRole('region', { name: 'Liste des étapes du plan' });
    const planToggle = screen.getByRole('button', { name: /Plan de migration/u });

    expect(planRegion).toBeTruthy();
    expect(planToggle.className).toContain('min-h-11');
    fireEvent.click(planToggle);
    expect(screen.getByText('Terminé')).toBeTruthy();
    expect(screen.getByText('En cours')).toBeTruthy();
    expect(screen.getByText('Vérifier le schéma')).toBeTruthy();

    const thoughtToggle = screen.getByRole('button', { name: 'Développer Analyse du schéma' });

    fireEvent.click(thoughtToggle);
    expect(screen.getByText('SELECT * FROM invoices')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Réduire Analyse du schéma' })).toBeTruthy();

    expect(screen.getByText('La connexion à GitHub n’a pas pu être établie.')).toBeTruthy();
    expect(screen.getByText('Les autorisations accordées ne couvrent pas les besoins de l’agent.')).toBeTruthy();
    expect(screen.getByText('GitHub est connecté avec le compte avi@example.test.')).toBeTruthy();
    expect(screen.queryByText(/Raw upstream|secret=123/u)).toBeNull();

    await act(async () => {
      await i18n.changeLanguage('en');
    });

    expect(screen.getByText('This project has not been generated yet')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Generate app' })).toBeTruthy();
    expect(screen.getByRole('status', { name: /Generating Response/u })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Collapse Analyse du schéma' })).toBeTruthy();
    expect(screen.getByText('GitHub connected as avi@example.test.')).toBeTruthy();
    expect(screen.getByText('Vérifier le schéma')).toBeTruthy();
  });
});
