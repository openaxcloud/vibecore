import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

/*
 * BUG-I18N-008 — « Aucun dépôt distant connecté » affiché DEUX FOIS.
 *
 * Relevé en réel dans l'état vide du panneau Git (env de test, 1440) : la phrase
 * apparaissait deux fois d'affilée. Ce ne sont pas deux rendus de la même
 * chaîne, mais DEUX chaînes de catalogues différents au texte identique :
 *
 *   GitTab.tsx                 -> idePanels.git.noRemote  = « Aucun dépôt distant connecté »
 *   GitProviderConnectPanel.tsx -> gitProvider.title      = « Aucun dépôt distant connecté »
 *
 * Le second est imbriqué juste sous le premier, d'où la répétition. C'est le
 * titre du panneau qui reste : il vit dans l'encadré, porte sa description et
 * précède les actions.
 */

const GIT_TAB = 'app/components/git/GitTab.tsx';
const CONNECT = 'app/components/git/GitProviderConnectPanel.tsx';

describe('état vide du panneau Git', () => {
  it('n’annonce plus deux fois l’absence de dépôt distant', () => {
    const tab = readFileSync(GIT_TAB, 'utf8');

    expect(tab).not.toContain("{t('idePanels.git.noRemote')}");
  });

  it('garde le titre du panneau de connexion, qui porte la description et les actions', () => {
    const connect = readFileSync(CONNECT, 'utf8');

    expect(connect).toContain("copy['gitProvider.title']");
    expect(connect).toContain("copy['gitProvider.description']");
  });

  it('les deux catalogues portent bien le MÊME texte — c’est ce qui rendait le doublon invisible en relecture', () => {
    /*
     * Documenté par un test : une relecture de `GitTab` seul ne pouvait pas voir
     * la répétition, puisque l'autre moitié vient d'un composant enfant et d'un
     * catalogue différent.
     */
    const catalogueIde = readFileSync('app/lib/i18n/catalogs/ide-panels.ts', 'utf8');
    const catalogueGit = readFileSync('app/lib/i18n/catalogs/git-provider-connect.ts', 'utf8');

    expect(catalogueIde).toContain("'idePanels.git.noRemote': 'Aucun dépôt distant connecté'");
    expect(catalogueGit).toContain("'gitProvider.title': 'Aucun dépôt distant connecté'");
  });
});
