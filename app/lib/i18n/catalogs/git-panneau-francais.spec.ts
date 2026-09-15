import { describe, expect, it } from 'vitest';

import { idePanelsEn, idePanelsFr } from './ide-panels';

/*
 * BUG-I18N-007 — « PANNEAU GIT : anglais brut à côté de son propre équivalent
 * français ». Le panneau affichait « Committer les modifications » ET, juste à
 * côté, « Commit & push », « Push », « Pull », « Fetch » — non traduits.
 *
 * Le mélange est le défaut, pas l'anglais en soi : la maison a déjà tranché
 * pour les verbes français (« Aucun fichier à pousser », « {value0} pour
 * pousser, {value1} pour tirer »). Ces quatre libellés contredisaient cette
 * convention à l'endroit le plus visible.
 *
 * ⚠️ CE TEST NE DIT PAS « tout doit différer de l'anglais ». Certains libellés
 * SONT identiques à juste titre — « Branches », « SSH », « src/App.tsx », un
 * gabarit `origin/{branch}`. Les lister explicitement est ce qui empêche ce
 * test de devenir un refus aveugle : on nomme ce qu'on accepte.
 */

/** Identiques à l'anglais À DESSEIN : noms propres, jetons techniques, gabarits. */
const IDENTIQUES_LEGITIMES = new Set([
  'idePanels.git.branches',
  'idePanels.git.remoteTracking',
  'idePanels.git.sshLabel',
  'idePanels.git.fileExample',
]);

describe('panneau Git en français', () => {
  it('les VERBES d’action sont traduits, comme le reste du panneau', () => {
    expect(idePanelsFr['idePanels.git.push']).toBe('Pousser');
    expect(idePanelsFr['idePanels.git.pull']).toBe('Tirer');
    expect(idePanelsFr['idePanels.git.fetch']).toBe('Récupérer');
    expect(idePanelsFr['idePanels.git.commitPush']).toBe('Committer et pousser');
  });

  it('et aucun AUTRE libellé Git ne reste en anglais sans être déclaré', () => {
    const restes: Array<[string, string]> = [];

    for (const [cle, valeur] of Object.entries(idePanelsFr)) {
      if (!cle.startsWith('idePanels.git.') || IDENTIQUES_LEGITIMES.has(cle)) {
        continue;
      }

      const anglais = (idePanelsEn as Record<string, string>)[cle];

      if (typeof anglais === 'string' && typeof valeur === 'string' && anglais === valeur) {
        restes.push([cle, valeur]);
      }
    }

    expect(restes, `libellés Git non traduits : ${JSON.stringify(restes)}`).toEqual([]);
  });

  it('la sonde compare bien deux catalogues remplis', () => {
    const clesGit = Object.keys(idePanelsFr).filter((c) => c.startsWith('idePanels.git.'));

    expect(clesGit.length, 'le panneau Git a des libellés').toBeGreaterThan(20);
  });
});
