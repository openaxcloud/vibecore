import { describe, expect, it } from 'vitest';

import { idePanelsEn, idePanelsFr } from './ide-panels';

describe('IDE panel translation catalog', () => {
  it('keeps English and French keys and interpolation tokens in exact parity', () => {
    expect(Object.keys(idePanelsFr).sort()).toEqual(Object.keys(idePanelsEn).sort());

    for (const key of Object.keys(idePanelsEn) as Array<keyof typeof idePanelsEn>) {
      const tokens = (value: string) => [...value.matchAll(/\{([a-zA-Z0-9_]+)\}/gu)].map((match) => match[1]).sort();
      expect(tokens(idePanelsFr[key]), key).toEqual(tokens(idePanelsEn[key]));
    }
  });

  it('uses the approved French terms for core IDE concepts', () => {
    expect(idePanelsFr['idePanels.deployment.database']).toBe('Base de données');
    expect(idePanelsFr['idePanels.git.workingTree']).toBe('Arborescence de travail');
    expect(idePanelsFr['idePanels.preview.deployments']).toBe('Déploiements');
    expect(idePanelsFr['idePanels.preview.startingWorkspace']).toContain('espace de travail');
    expect(idePanelsFr['idePanels.preview.runtimeError']).toBe('Erreur d’aperçu : {message}{location}');
    expect(idePanelsFr['idePanels.preview.unhandledRejection']).toContain('Rejet de promesse non géré');
  });

  it('contains complete plural families used by the panels', () => {
    for (const family of [
      'idePanels.database.hours',
      'idePanels.git.pushCount',
      'idePanels.git.pullCount',
      'idePanels.git.conflictBannerBody',
      'idePanels.git.changed',
      'idePanels.git.conflicts',
      'idePanels.git.discardAllBody',
      'idePanels.git.commitStaged',
      'idePanels.git.changedFiles',
    ]) {
      expect(idePanelsEn).toHaveProperty(`${family}_one`);
      expect(idePanelsEn).toHaveProperty(`${family}_other`);
      expect(idePanelsFr).toHaveProperty(`${family}_one`);
      expect(idePanelsFr).toHaveProperty(`${family}_other`);
    }
  });
});
