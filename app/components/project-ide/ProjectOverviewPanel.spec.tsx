/** @vitest-environment jsdom */

import { readFileSync } from 'node:fs';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectOverviewPanel } from './ProjectOverviewPanel';
import {
  formatProjectOverviewPanelCopy,
  formatProjectOverviewPanelCount,
  formatProjectOverviewPanelDate,
  formatProjectOverviewPanelNumber,
  getProjectOverviewPanelCopy,
  projectOverviewActivityLabel,
  projectOverviewCategoryLabel,
  projectOverviewMemberStatusLabel,
  projectOverviewPanelEn,
  projectOverviewPanelFr,
  projectOverviewRoleLabel,
  projectOverviewSourceLabel,
  projectOverviewWorkspaceStatusLabel,
} from '~/lib/i18n/catalogs/project-overview-panel';
import type { ProjectOverviewInsights } from '~/lib/project-overview';

let language = 'en';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { language, resolvedLanguage: language } }),
}));

const enrichedOverview: ProjectOverviewInsights = {
  summary: {
    sourceType: 'github',
    workspaceStatus: 'RUNNING',
    runtimeMode: 'remote-kubernetes',
    branch: 'feature/customer-owned-branch',
    fileCount: 12_345,
    activeMemberCount: 1,
    scriptCount: 2,
    projectCreatedAt: '2026-05-01T12:00:00.000Z',
    projectUpdatedAt: '2026-05-02T12:00:00.000Z',
  },
  stack: [
    { name: 'React', category: 'frontend', source: 'react' },
    { name: 'Vite', category: 'tooling', source: 'vite.config.ts' },
  ],
  scripts: [
    {
      name: 'dev:user-owned-script',
      command: 'vite --host 0.0.0.0 --mode customer-value',
      runCommand: 'pnpm run dev:user-owned-script',
      manifestPath: 'package.json',
    },
    { name: 'build', command: 'vite build', runCommand: 'pnpm run build', manifestPath: 'package.json' },
  ],
  commits: [
    {
      sha: 'abcdef123456',
      shortSha: 'abcdef12',
      message: 'User-authored English commit message — keep exactly',
      author: 'Customer Author',
      date: '2026-05-02T11:00:00.000Z',
    },
  ],
  members: [
    {
      id: 'collab_customer_id',
      userId: 'user_customer_id',
      roleKey: 'admin',
      status: 'active',
      filePath: 'src/customer-owned-path/App.tsx',
    },
  ],
  activity: [{ action: 'project.files.import_zip', createdAt: '2026-05-02T10:00:00.000Z' }],
};

function interpolationTokens(value: string): string[] {
  return [...value.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu)].map((match) => match[1]).sort();
}

describe('<ProjectOverviewPanel /> i18n', () => {
  afterEach(() => {
    cleanup();
    language = 'en';
  });

  it('keeps catalog parity, locale formatting, mapped labels, and English fallback', () => {
    expect(Object.keys(projectOverviewPanelFr).sort()).toEqual(Object.keys(projectOverviewPanelEn).sort());

    for (const key of Object.keys(projectOverviewPanelEn) as Array<keyof typeof projectOverviewPanelEn>) {
      expect(projectOverviewPanelEn[key].trim().length, key).toBeGreaterThan(0);
      expect(projectOverviewPanelFr[key].trim().length, key).toBeGreaterThan(0);
      expect(interpolationTokens(projectOverviewPanelFr[key]), key).toEqual(
        interpolationTokens(projectOverviewPanelEn[key]),
      );
    }

    expect(getProjectOverviewPanelCopy('de-DE')['projectOverview.kicker']).toBe('Project overview');
    expect(formatProjectOverviewPanelNumber(12_345, 'fr')).toMatch(/^12[\s\u202f]345$/u);
    expect(
      formatProjectOverviewPanelCount('fr', 2, {
        one: projectOverviewPanelFr['projectOverview.count.signals.one'],
        other: projectOverviewPanelFr['projectOverview.count.signals.other'],
      }),
    ).toBe('2 signaux');
    expect(formatProjectOverviewPanelDate('invalid-provider-date', 'fr')).toBe('Date indisponible');
    expect(projectOverviewSourceLabel('template', 'fr')).toBe('Modèle');
    expect(projectOverviewWorkspaceStatusLabel('RUNNING', 'fr')).toBe('En cours');
    expect(projectOverviewCategoryLabel('frontend', 'fr')).toBe('Interface utilisateur');
    expect(projectOverviewRoleLabel('admin', 'fr')).toBe('Administrateur');
    expect(projectOverviewMemberStatusLabel('editing', 'fr')).toBe('En édition');
    expect(projectOverviewActivityLabel('project.create', 'fr')).toBe('Projet créé');
    expect(projectOverviewActivityLabel('vendor.technical_identifier', 'fr')).toBe('vendor.technical_identifier');
    expect(
      formatProjectOverviewPanelCopy(projectOverviewPanelFr['projectOverview.panel.aria'], {
        project: 'Customer Project',
      }),
    ).toBe('Aperçu du projet Customer Project');
  });

  it('renders the enriched overview in French while preserving user and technical values', () => {
    language = 'fr';

    render(
      <ProjectOverviewPanel
        project={{ id: 'project_customer_id', name: 'Analytics App', sourceType: 'github' }}
        data={{ overview: enrichedOverview }}
      />,
    );

    expect(screen.getByRole('region', { name: 'Aperçu du projet Analytics App' })).toBeTruthy();
    expect(screen.getByText('Aperçu du projet')).toBeTruthy();
    expect(screen.getByText('Analytics App')).toBeTruthy();
    expect(screen.getByLabelText(/Source\s*:\s*GitHub/u)).toBeTruthy();
    expect(screen.getByRole('group', { name: /Fichiers.*12[\s\u202f]345.*Fichiers suivis/u })).toBeTruthy();
    expect(
      screen.getByRole('group', {
        name: /Branche.*feature\/customer-owned-branch.*Branche Git actuelle/u,
      }),
    ).toBeTruthy();
    expect(screen.getByRole('group', { name: /Espace de travail.*En cours.*remote-kubernetes/u })).toBeTruthy();
    expect(screen.getByRole('group', { name: /Créé le.*mai 2026.*Mis à jour le.*mai 2026/u })).toBeTruthy();
    expect(screen.getByText('Stack détectée')).toBeTruthy();
    expect(screen.getByText('2 signaux')).toBeTruthy();
    expect(screen.getByLabelText('React, détecté depuis react')).toBeTruthy();
    expect(screen.getByText('Interface utilisateur · react')).toBeTruthy();
    expect(screen.getByText('Outils · vite.config.ts')).toBeTruthy();
    expect(screen.getByText('Scripts npm disponibles')).toBeTruthy();
    expect(screen.getByText('2 scripts')).toBeTruthy();
    expect(
      screen.getByRole('group', { name: /Script dev:user-owned-script.*pnpm run dev:user-owned-script/u }),
    ).toBeTruthy();
    expect(screen.getByText('vite --host 0.0.0.0 --mode customer-value')).toBeTruthy();
    expect(screen.getByText('User-authored English commit message — keep exactly')).toBeTruthy();
    expect(screen.getByText('Customer Author')).toBeTruthy();
    expect(screen.getByText('abcdef12')).toBeTruthy();
    expect(screen.getByText('user_customer_id')).toBeTruthy();
    expect(screen.getByText('Actif')).toBeTruthy();
    expect(screen.getByText(/Administrateur.*src\/customer-owned-path\/App\.tsx/u)).toBeTruthy();
    expect(screen.getByText('Fichiers du projet importés depuis une archive ZIP')).toBeTruthy();
    expect(screen.queryByText('Project Files Import Zip')).toBeNull();
  });

  it('localizes every fallback and empty state without inventing user identifiers', () => {
    language = 'fr';

    render(
      <ProjectOverviewPanel
        project={{}}
        data={{ files: [], collaborators: [], recentActivity: [], workspace: null, git: {} }}
      />,
    );

    expect(screen.getByRole('region', { name: 'Aperçu du projet Projet sans titre' })).toBeTruthy();
    expect(screen.getByText('Projet sans titre')).toBeTruthy();
    expect(screen.getByText('Aucun espace de travail')).toBeTruthy();
    expect(screen.getByText('Indisponible')).toBeTruthy();
    expect(screen.getByText('0 signal')).toBeTruthy();
    expect(screen.getByText('0 script')).toBeTruthy();
    expect(screen.getByText('0 membre actif')).toBeTruthy();
    expect(screen.getByText(/Aucune pile technique détectée/u)).toBeTruthy();
    expect(screen.getByText('Aucun script npm trouvé dans les manifestes du projet.')).toBeTruthy();
    expect(screen.getByText('Aucun commit signalé pour le moment.')).toBeTruthy();
    expect(screen.getByText('Aucun collaborateur ni aucune session active pour le moment.')).toBeTruthy();
    expect(screen.getByText('Aucune activité du projet pour le moment.')).toBeTruthy();
    expect(screen.getAllByRole('status')).toHaveLength(5);
  });

  it('recovers from partial runtime data, masks invalid dates, and preserves unknown technical identifiers', () => {
    language = 'fr';

    const partialOverview = {
      summary: {
        sourceType: 'custom-source-v9',
        workspaceStatus: 'custom-workspace-state',
        runtimeMode: 'edge-runtime-v9',
        branch: 'customer/branch',
        fileCount: 1,
        activeMemberCount: 1,
        scriptCount: 0,
        projectCreatedAt: 'invalid-provider-date',
        projectUpdatedAt: 'also-invalid',
      },
      members: [
        {
          id: 'member-id',
          userId: 'customer-user-id',
          roleKey: 'custom-role-key',
          status: 'custom-presence-status',
        },
      ],
      activity: [{ action: 'vendor.technical_identifier', createdAt: 'invalid-event-date' }],
    } as unknown as ProjectOverviewInsights;

    render(
      <ProjectOverviewPanel
        project={{ id: 'project-user-id', name: 'Customer Project' }}
        data={{ overview: partialOverview }}
      />,
    );

    expect(screen.getByText('custom-source-v9')).toBeTruthy();
    expect(screen.getByText('custom-workspace-state')).toBeTruthy();
    expect(screen.getByText('edge-runtime-v9')).toBeTruthy();
    expect(screen.getByText('customer/branch')).toBeTruthy();
    expect(screen.getByText('customer-user-id')).toBeTruthy();
    expect(screen.getByText('custom-role-key')).toBeTruthy();
    expect(screen.getByText('custom-presence-status')).toBeTruthy();
    expect(screen.getByText('vendor.technical_identifier')).toBeTruthy();
    expect(screen.getAllByText('Date indisponible')).toHaveLength(2);
    expect(screen.getByText('Mis à jour le Date indisponible')).toBeTruthy();
    expect(screen.queryByText('invalid-provider-date')).toBeNull();
  });

  /*
   * SCR-008 — la jauge doit dire « on ne sait pas », jamais « zéro ».
   *
   * C'est le point qui fait toute la valeur du lecteur cgroup en amont : il rend
   * `null` quand le noyau n'expose rien, et un rendu qui traduirait ce `null` en
   * « 0 % » annulerait ce soin à la dernière ligne — l'utilisateur lirait
   * « rien n'est consommé » là où la vérité est « la mesure manque ».
   */
  it('rend les jauges de ressources sans jamais transformer une absence en zéro', () => {
    language = 'fr';

    render(
      <ProjectOverviewPanel
        project={{ id: 'project_customer_id', name: 'Analytics App', sourceType: 'github' }}
        data={{
          overview: enrichedOverview,
          resources: {
            memory: { used: null, limit: null },
            cpu: { ratio: null, limitCores: null },
            storage: { used: null, limit: null },
            unavailable: true,
          },
        }}
      />,
    );

    const gauges = screen.getByTestId('project-overview-resources');

    expect(gauges.textContent).toContain('Non communiqué');
    expect(gauges.textContent).toContain('Mesure en cours');
    expect(gauges.textContent).not.toMatch(/\b0\s*%/u);

    // Aucune barre n'est dessinée tant qu'aucune mesure n'existe.
    expect(screen.queryAllByRole('progressbar')).toHaveLength(0);
  });

  it('rend les vraies valeurs cgroup quand l’espace de travail les communique', () => {
    language = 'fr';

    render(
      <ProjectOverviewPanel
        project={{ id: 'project_customer_id', name: 'Analytics App', sourceType: 'github' }}
        data={{
          overview: enrichedOverview,
          resources: {
            memory: { used: 400_769_024, limit: 536_870_912 },
            cpu: { ratio: 0.42, limitCores: 2 },
            storage: { used: 1_610_612_736, limit: null },
          },
        }}
      />,
    );

    const gauges = screen.getByTestId('project-overview-resources');

    expect(gauges.textContent).toContain('382');
    expect(gauges.textContent).toContain('512');
    expect(gauges.textContent).toContain('42');
    expect(gauges.textContent).toContain('Aucune limite posée');

    // Mémoire et processeur ont une mesure ET une limite ; le stockage n'a pas de limite.
    expect(screen.getAllByRole('progressbar')).toHaveLength(2);
  });

  it('has zero scanner findings and explicit responsive, theme, empty-state and command safeguards', async () => {
    const file = 'app/components/project-ide/ProjectOverviewPanel.tsx';
    const source = readFileSync(file, 'utf8');
    const { scanSource } = await import('../../../scripts/i18n/source-scanner.mjs');
    const result = scanSource(source, file);

    expect(result.parseErrors).toEqual([]);
    expect(result.findings).toEqual([]);
    expect(source).toContain('min-[420px]:flex-row');
    expect(source).toContain('overflow-x-auto');
    expect(source).toContain('break-all');
    expect(source).toContain('role="region"');
    expect(source).toContain('role="status"');
    expect(source).toContain('aria-label');
    expect(source).toContain('bg-bolt-elements-background-depth-2');
    expect(source).not.toContain('truncate');
    expect(source).not.toContain('titleCase');
    expect(source).not.toContain('formatDate');
  });
});
