import { describe, expect, it } from 'vitest';

import {
  getProjectDashboardActivityCopy,
  projectActivityActionLabel,
  projectDashboardActivityEn,
  projectDashboardActivityFr,
  projectWorkspaceStatusLabel,
} from './project-dashboard-activity';

function interpolationTokens(value: string): string[] {
  return [...value.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu)].map((match) => match[1]).sort();
}

describe('project dashboard and activity catalog', () => {
  it('keeps the English and French catalogs in exact key and interpolation parity', () => {
    expect(Object.keys(projectDashboardActivityFr).sort()).toEqual(Object.keys(projectDashboardActivityEn).sort());

    for (const [key, english] of Object.entries(projectDashboardActivityEn)) {
      expect(
        interpolationTokens(projectDashboardActivityFr[key as keyof typeof projectDashboardActivityFr]),
        key,
      ).toEqual(interpolationTokens(english));
    }
  });

  it('localizes known workspace states without exposing unknown implementation values', () => {
    expect(projectWorkspaceStatusLabel('RUNNING', 'fr')).toBe('En cours d’exécution');
    expect(projectWorkspaceStatusLabel(undefined, 'fr')).toBe('Non démarré');
    expect(projectWorkspaceStatusLabel('INTERNAL_RECONCILING_STATE', 'fr')).toBe('État indisponible');
  });

  it('maps audit codes to professional labels and uses a safe generic fallback', () => {
    expect(projectActivityActionLabel('project.import_github', 'fr')).toBe('Dépôt GitHub importé');
    expect(projectActivityActionLabel('project.git.commit', 'fr')).toBe('Commit créé');
    expect(projectActivityActionLabel('private.unknown.action', 'fr')).toBe('Activité du projet');
    expect(projectActivityActionLabel('private.unknown.action', 'fr')).not.toContain('private.unknown.action');
    expect(getProjectDashboardActivityCopy('de')['projectActivity.page.title']).toBe('Project activity');
  });
});
