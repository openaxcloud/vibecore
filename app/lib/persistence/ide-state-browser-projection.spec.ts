import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { projectIdeStateForBrowser } from './ide-state-browser-projection';

const enveloppe = () => ({
  ideState: {
    version: 7,
    state: {
      ui: { rightPanelOpen: true, rightPanelWidth: 320 },
      chat: { messages: [] },
      files: {
        updatedAt: '2026-09-04T16:00:00.000Z',
        entries: [
          { path: 'src/App.tsx', content: 'export const App = () => null;\n' },
          { path: 'package.json', content: '{"name":"x"}' },
        ],
      },
      updatedAt: '2026-09-04T16:00:00.000Z',
    },
  },
});

describe('projectIdeStateForBrowser — sens 1 : le navigateur ne reçoit plus le magasin', () => {
  it('drops files from what the browser gets', () => {
    const sortie = projectIdeStateForBrowser(enveloppe()) as any;
    expect(sortie.ideState.state.files).toBeUndefined();
  });

  it('keeps everything the browser actually reads', () => {
    const sortie = projectIdeStateForBrowser(enveloppe()) as any;
    expect(sortie.ideState.state.ui).toEqual({ rightPanelOpen: true, rightPanelWidth: 320 });
    expect(sortie.ideState.state.chat).toEqual({ messages: [] });
    expect(sortie.ideState.state.updatedAt).toBe('2026-09-04T16:00:00.000Z');
    expect(sortie.ideState.version).toBe(7);
  });

  it('drops ONLY the server-only keys — a future key must not vanish silently', () => {
    const avec = enveloppe() as any;
    avec.ideState.state.collaboration = { documents: { a: 1 } };

    const sortie = projectIdeStateForBrowser(avec) as any;
    expect(sortie.ideState.state.collaboration).toEqual({ documents: { a: 1 } });
  });

  it('passes shapes it does not understand straight through', () => {
    expect(projectIdeStateForBrowser(null)).toBeNull();
    expect(projectIdeStateForBrowser({ ideState: null })).toEqual({ ideState: null });
    expect(projectIdeStateForBrowser({ ideState: { state: 'nope' } })).toEqual({ ideState: { state: 'nope' } });
  });
});

describe('projectIdeStateForBrowser — sens 2 : le serveur, lui, garde tout', () => {
  /*
   * C'EST LE TEST QUI COMPTE LE PLUS.
   *
   * `files` n'est pas un résidu : `listProjectFilesIncludingIdeState` est
   * appelée depuis plus de dix endroits de l'API — statut et commit git,
   * exports, déploiements. `project-storage.ts` le dit : « L'IDE enregistre une
   * modification dans le pod et dans `ide-state` ; aucun des deux n'est l'arbre
   * de travail git » — sans ce magasin, un fichier édité à la main redevient
   * invisible pour git et `status` annonce « 0 changement » indéfiniment.
   *
   * Une projection qui muterait son entrée retirerait `files` pour TOUT LE
   * MONDE, y compris ces dix appelants, et le défaut reviendrait sans qu'aucun
   * test ne rougisse.
   */
  it('never mutates the payload the server still holds', () => {
    const source = enveloppe();
    const avant = JSON.stringify(source);

    projectIdeStateForBrowser(source);

    expect(JSON.stringify(source)).toBe(avant);
    expect(source.ideState.state.files.entries).toHaveLength(2);
    expect(source.ideState.state.files.entries[0].content).toBe('export const App = () => null;\n');
  });

  /*
   * La copie est SUPERFICIELLE, et c'est assumé : les sous-objets (`ui`, `chat`)
   * restent partagés par référence avec la charge d'origine. C'est sans
   * conséquence ici — la valeur rendue est sérialisée en JSON immédiatement par
   * le chargeur Remix — et cloner en profondeur coûterait le prix de ce qu'on
   * cherche justement à ne plus payer.
   *
   * Ce test l'ÉCRIT explicitement, pour que personne ne suppose une isolation
   * profonde qui n'existe pas. J'ai d'abord écrit l'assertion inverse ; elle a
   * échoué, et c'est la mesure qui avait raison.
   */
  it('shares nested objects by reference — the guarantee is "no mutation", not deep isolation', () => {
    const source = enveloppe();
    const sortie = projectIdeStateForBrowser(source) as any;

    expect(sortie.ideState.state.ui).toBe(source.ideState.state.ui);

    // Ce qui compte : la projection elle-même n'a rien modifié.
    expect(source.ideState.state.files.entries).toHaveLength(2);
  });
});

describe('la sûreté de la projection dépend de la fusion serveur', () => {
  /*
   * Le client renvoie `{ ...état reçu }` dans son PUT. Ne recevant plus `files`,
   * il ne le renvoie plus, donc `incoming.files === undefined`. Il faut alors
   * que `mergeProjectIdeState` CONSERVE l'existant — sinon la première
   * sauvegarde d'interface effacerait le magasin de fichiers, et git
   * repartirait sur « 0 changement ».
   *
   * Ce test échoue si quelqu'un retire cette branche. Il est volontairement
   * ancré sur le CODE de la fusion (même procédé que
   * `services/api/src/ide-state-files-guard.spec.ts`), faute de pouvoir importer
   * une fonction non exportée du service API depuis ce paquet.
   */
  const APP = readFileSync(join(__dirname, '../../../services/api/src/app.ts'), 'utf8');

  it('mergeProjectIdeState keeps existing files when the client sends none', () => {
    const debut = APP.indexOf('function mergeProjectIdeState(');
    expect(debut, 'mergeProjectIdeState introuvable : ce test ne mesure rien').toBeGreaterThan(-1);

    const corps = APP.slice(debut, APP.indexOf('\n}', debut));

    expect(corps).toContain('incoming.files === undefined');
    expect(corps).toContain('files: existing.files');
  });
});
