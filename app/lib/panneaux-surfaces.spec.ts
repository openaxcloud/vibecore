import { describe, expect, it } from 'vitest';
import { IDE_WORKSPACE_PANELS } from './ide/panel-registry';
import {
  ECODE_MOBILE_MORE_ITEMS,
  ECODE_MOBILE_TOOLS,
  MOBILE_TOOLS_HORS_ROUTAGE,
  MOBILE_TOOL_ACTIONS,
  MOBILE_TOOL_TO_MANAGEMENT_PANEL,
} from './mobile-ide-tabs';
import { ECODE_MOBILE_TAB_META_BASE } from './mobile-tab-meta';

/*
 * AUCUNE SURFACE NE DOIT PERDRE UN PANNEAU.
 *
 * Avi : « la barre du bas, le sélecteur d'onglets et la liste d'outils doivent
 * afficher exactement la même liste, sans en perdre un seul. »
 *
 * NUANCE MESUREE, ET ELLE COMPTE. Les surfaces ne sont pas de meme nature : la
 * barre du bas montre les onglets OUVERTS (defaut preview/agent/deployments) et
 * les panneaux balayables sont une navigation — ni l'une ni l'autre ne pretend
 * cataloguer. Les seules surfaces qui PRETENDENT lister sont la liste d'outils
 * (`+`), le menu « More » (`…`) et le registre de routage.
 *
 * L'invariant tenable est donc : tout outil propose est atteignable depuis
 * CHAQUE surface qui pretend lister, et le routage sait ou l'envoyer. Un outil
 * visible ici et absent la, c'est le panneau qu'on perd selon par ou l'on passe.
 *
 * Inventaire mesure le 2026-09-08 sur b4ee13bae — union normalisee de 33
 * panneaux (et non 35 : `chat` ≡ `agent`, `deploy` ≡ `deployments`, le second
 * declare dans la table, le premier traduit en ligne a BaseChat.tsx:9438).
 */

/*
 * Ce qui n'a pas besoin de la table de routage : les ACTIONS, lues dans la
 * donnee (`kind`), et les panneaux qui ont leur propre bascule. Aucune liste
 * recopiee ici — une exception recopiee dans un test finit par decrire un etat
 * du code qui n'existe plus.
 */
const SANS_ROUTAGE = new Set([...MOBILE_TOOL_ACTIONS, ...MOBILE_TOOLS_HORS_ROUTAGE]);

describe('les surfaces qui pretendent lister listent la meme chose', () => {
  it("liste d'outils et menu « More » sont STRICTEMENT egaux, dans les deux sens", () => {
    /*
     * Avi tranche : « liste d'outils ou menu c'est le même usage », donc même
     * contenu. Ce n'est plus « l'une contient l'autre » — c'est l'egalite. Un
     * outil visible ici et absent la, c'est le panneau qu'on perd selon par ou
     * l'on passe.
     */
    const outils = [...ECODE_MOBILE_TOOLS.map((tool) => tool.id)].sort();
    const menu = [...ECODE_MOBILE_MORE_ITEMS].sort();

    expect(
      menu,
      `manquants dans « More » : ${outils.filter((id) => !menu.includes(id)).join(', ')} | en trop : ${menu.filter((id) => !outils.includes(id)).join(', ')}`,
    ).toEqual(outils);
  });

  it('une ACTION est proposee dans la palette ET absente du registre des panneaux', () => {
    /*
     * Avi tranche le 2026-09-09 : « `share` reste accessible dans la palette
     * mobile […] hors du registre des panneaux, present dans la palette comme
     * action ». Les deux moities comptent, et ce test les tient ENSEMBLE :
     *
     *   - retirer `share` de la palette (ce que faisait ce lot) fait rougir la
     *     premiere assertion ;
     *   - lui inventer une destination de panneau fait rougir la seconde.
     *
     * Ma faute d'hier etait de traiter « pas un panneau » comme « pas dans la
     * liste ». Une action n'est pas un panneau EN MOINS, c'est une categorie a
     * cote — et une categorie s'exclut du routage, pas de l'interface.
     */
    const proposes = ECODE_MOBILE_TOOLS.map((tool) => tool.id);
    const panneaux = new Set<string>(IDE_WORKSPACE_PANELS);

    expect(MOBILE_TOOL_ACTIONS, 'les actions declarees').toEqual(['share', 'commands']);

    for (const action of MOBILE_TOOL_ACTIONS) {
      expect(proposes, `action absente de la liste d'outils : ${action}`).toContain(action);
      expect(ECODE_MOBILE_MORE_ITEMS, `action absente du menu « More » : ${action}`).toContain(action);
      expect(panneaux.has(action), `action declaree comme panneau : ${action}`).toBe(false);
      expect(
        Object.prototype.hasOwnProperty.call(MOBILE_TOOL_TO_MANAGEMENT_PANEL, action),
        `action routee comme un panneau : ${action}`,
      ).toBe(false);
    }
  });

  it('un seul libelle par panneau : aucune entree de metadonnees qui ne soit un outil reel', () => {
    /*
     * `ECODE_MOBILE_TAB_META_BASE` portait des ALIAS (`actions`, `assistant`,
     * `console`, `debug`, `developer`, `app-storage`, `auth`, `publishing`,
     * `deploy`) — des etiquettes differentes pour un meme panneau. Ce sont ces
     * conversions dispersees qui font diverger les surfaces.
     */
    const outils = new Set(ECODE_MOBILE_TOOLS.map((tool) => tool.id));
    const alias = Object.keys(ECODE_MOBILE_TAB_META_BASE).filter((id) => !outils.has(id));

    expect(alias, `alias restants dans les metadonnees : ${alias.join(', ')}`).toEqual([]);
  });

  it('tout outil propose porte un libellé — dans les DEUX sens', () => {
    /*
     * LE DEFAUT QU'AVI A NOMME. `commands` etait rendu, il fonctionnait, et
     * aucune entree du meta ne le nommait : l'en-tete mobile et le selecteur
     * d'onglets affichaient donc « commands ». Le test voisin ne tenait qu'un
     * sens (aucune entree en trop) ; celui-ci tient l'autre (aucun outil sans
     * libelle), et c'est le sens qui manquait.
     */
    const sansLibelle = ECODE_MOBILE_TOOLS.map((tool) => tool.id).filter(
      (id) => !Object.prototype.hasOwnProperty.call(ECODE_MOBILE_TAB_META_BASE, id),
    );

    expect(sansLibelle, `outils sans libelle dans le meta : ${sansLibelle.join(', ')}`).toEqual([]);
  });

  it("le menu « More » propose TOUT ce que propose la liste d'outils", () => {
    const outils = ECODE_MOBILE_TOOLS.map((tool) => tool.id);
    const manquants = outils.filter((id) => !ECODE_MOBILE_MORE_ITEMS.includes(id));

    expect(manquants, `outils absents du menu « More » : ${manquants.join(', ')}`).toEqual([]);
  });

  it("le menu « More » ne propose rien que la liste d'outils ignore", () => {
    /*
     * L'autre sens : un id oublie dans « More » ne trouve aucune metadonnee et
     * rend une tuile vide (BaseChat.tsx:9465 fait un `find` qui echouerait).
     */
    const connus = new Set(ECODE_MOBILE_TOOLS.map((tool) => tool.id));
    const orphelins = ECODE_MOBILE_MORE_ITEMS.filter((id) => !connus.has(id));

    expect(orphelins, `entrees de « More » sans outil correspondant : ${orphelins.join(', ')}`).toEqual([]);
  });

  it('chaque outil propose sait ou aller', () => {
    const panneaux = new Set<string>(IDE_WORKSPACE_PANELS);

    const perdus = ECODE_MOBILE_TOOLS.map((tool) => tool.id).filter(
      (id) =>
        !SANS_ROUTAGE.has(id) &&
        !Object.prototype.hasOwnProperty.call(MOBILE_TOOL_TO_MANAGEMENT_PANEL, id) &&
        !panneaux.has(id),
    );

    expect(perdus, `outils sans destination : ${perdus.join(', ')}`).toEqual([]);
  });

  it('TEMOIN — les listes ne sont pas vides et le test mesure quelque chose', () => {
    // Sans ce temoin, des listes videes passeraient les trois tests ci-dessus.
    expect(ECODE_MOBILE_TOOLS.length).toBeGreaterThanOrEqual(30);
    expect(ECODE_MOBILE_MORE_ITEMS.length).toBeGreaterThanOrEqual(30);
    expect(Object.keys(MOBILE_TOOL_TO_MANAGEMENT_PANEL).length).toBeGreaterThanOrEqual(20);
  });
});
