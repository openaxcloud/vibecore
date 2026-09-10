import { describe, expect, it } from 'vitest';

import {
  IDE_ADDRESSABLE_PANELS,
  IDE_MANAGEMENT_PANELS,
  IDE_PANEL_ALIASES,
  isIdeAddressablePanel,
  resolveIdePanelKey,
} from './panel-registry';
import { MOBILE_TOOL_TO_MANAGEMENT_PANEL } from '~/lib/mobile-ide-tabs';
import { MOBILE_TOOL_ALIASES, outilCanonique } from '~/lib/mobile-tab-meta';

/*
 * UN PANNEAU, UNE PORTE.
 *
 * Trois doublons corrigés séparément avaient le MÊME mécanisme : le panneau
 * était joignable par deux clés, et la surface le montait sous chacune. Deux
 * clés, deux instances — « Domaines » ouvrait un second exemplaire, le Terminal
 * et l'Environnement se dédoublaient, et l'état vide du panneau Git s'affichait
 * deux fois d'affilée.
 *
 * Les corriger un par un ne protège de rien : rien n'empêche une quatrième clé
 * d'apparaître demain. Ce fichier compte les PORTES, et rougit dès qu'un
 * panneau en gagne une seconde.
 *
 * Les quatre façons connues d'ouvrir une seconde porte, chacune tenue ci-dessous :
 *   1. une clé d'alias qui est AUSSI un panneau canonique ;
 *   2. un alias qui pointe sur un autre alias (la chaîne laisse la clé
 *      intermédiaire vivante) ;
 *   3. deux tables d'alias qui ne disent pas la même chose ;
 *   4. un id monté par deux registres à la fois.
 */

const PANNEAUX_CANONIQUES = new Set<string>(IDE_ADDRESSABLE_PANELS);

describe('un panneau, une porte', () => {
  it("aucune clé d'alias n'est elle-même un panneau canonique", () => {
    /*
     * Si `deploy` était à la fois un alias vers `deployments` ET un panneau
     * déclaré, la résolution dépendrait de qui regarde en premier — et les deux
     * surfaces monteraient chacune la leur.
     */
    const mobiles = Object.keys(MOBILE_TOOL_ALIASES).filter((cle) => PANNEAUX_CANONIQUES.has(cle));
    const urls = Object.keys(IDE_PANEL_ALIASES).filter((cle) => PANNEAUX_CANONIQUES.has(cle));

    expect(mobiles, `alias mobiles qui sont aussi des panneaux : ${mobiles.join(', ')}`).toEqual([]);
    expect(urls, `alias d'URL qui sont aussi des panneaux : ${urls.join(', ')}`).toEqual([]);
  });

  it('aucune chaîne : un alias pointe toujours DIRECTEMENT sur un canonique', () => {
    const chaines: string[] = [];

    for (const [cle, cible] of Object.entries(MOBILE_TOOL_ALIASES)) {
      if (MOBILE_TOOL_ALIASES[cible]) {
        chaines.push(`${cle} → ${cible} → ${MOBILE_TOOL_ALIASES[cible]}`);
      }
    }

    for (const [cle, cible] of Object.entries(IDE_PANEL_ALIASES)) {
      if (IDE_PANEL_ALIASES[cible]) {
        chaines.push(`URL ${cle} → ${cible} → ${IDE_PANEL_ALIASES[cible]}`);
      }
    }

    expect(chaines, `chaînes d'alias : ${chaines.join(' | ')}`).toEqual([]);
  });

  it('toute cible d’alias est un panneau réellement adressable', () => {
    const cibles = [...new Set([...Object.values(MOBILE_TOOL_ALIASES), ...Object.values(IDE_PANEL_ALIASES)])];
    const perdues = cibles.filter((cible) => !isIdeAddressablePanel(cible));

    expect(perdues, `alias qui mènent nulle part : ${perdues.join(', ')}`).toEqual([]);
  });

  it('les deux tables d’alias ne se contredisent pas — et la seule exception est nommée', () => {
    /*
     * `chat` EST une exception légitime, et elle doit rester UNE. Le mobile a
     * deux vocabulaires : la SURFACE (`chat`, `deploy`) et l'ONGLET (`agent`,
     * `deployments`). Côté URL, `?panel=chat` doit atteindre l'agent ; côté
     * outils, `chat` n'est pas un outil et ne se résout pas.
     *
     * L'égalité EXACTE compte dans les deux sens : une nouvelle contradiction
     * fait rougir, et faire disparaître celle-ci aussi — pour qu'on la retire
     * en le sachant, pas par accident.
     */
    const contradictions = Object.entries(IDE_PANEL_ALIASES)
      .filter(([cle, cible]) => outilCanonique(cle) !== cible)
      .map(([cle]) => cle);

    expect(contradictions.sort(), 'contradictions entre alias d’URL et alias mobiles').toEqual(['chat']);
  });

  it('la table de routage mobile dit la même chose que la table d’alias', () => {
    /*
     * `MOBILE_TOOL_TO_MANAGEMENT_PANEL` porte encore des clés d'alias. Tant
     * qu'elle les porte, elle doit s'accorder avec le résolveur : sinon un même
     * outil ouvre un panneau selon la palette et un autre selon l'URL.
     */
    const desaccords = Object.entries(MOBILE_TOOL_TO_MANAGEMENT_PANEL)
      .filter(([cle, cible]) => outilCanonique(cle) !== cible)
      .map(([cle, cible]) => `${cle} : routage→${cible}, alias→${outilCanonique(cle)}`);

    expect(desaccords, `désaccords : ${desaccords.join(' | ')}`).toEqual([]);
  });

  it('aucun id n’est monté par deux registres à la fois', () => {
    /*
     * Le cas « Domaines » : l'id vivait dans le registre de gestion ET était
     * monté comme onglet d'espace de travail. Chaque montage crée son instance.
     */
    const gestion = new Set<string>(IDE_MANAGEMENT_PANELS);
    const espaceSeul = ['editor', 'preview', 'files', 'search', 'locks'];
    const deuxFois = espaceSeul.filter((id) => gestion.has(id));

    expect(deuxFois, `montés deux fois : ${deuxFois.join(', ')}`).toEqual([]);
  });

  it('une clé et son alias ouvrent LE MÊME panneau, jamais deux', () => {
    for (const [cle, cible] of Object.entries(IDE_PANEL_ALIASES)) {
      const parAlias = resolveIdePanelKey(cle);
      const parCanonique = resolveIdePanelKey(cible);

      expect(parAlias.status, `${cle} devrait résoudre comme alias`).toBe('alias');
      expect(parCanonique.status, `${cible} devrait être canonique`).toBe('canonical');
      expect(
        parAlias.status === 'alias' ? parAlias.panel : null,
        `${cle} et ${cible} doivent ouvrir le même panneau`,
      ).toBe(parCanonique.status === 'canonical' ? parCanonique.panel : undefined);
    }
  });

  it('TÉMOIN — les tables ne sont pas vides et le test mesure quelque chose', () => {
    // Sans ce témoin, des tables vidées passeraient les six tests ci-dessus.
    expect(Object.keys(IDE_PANEL_ALIASES).length).toBeGreaterThanOrEqual(15);
    expect(Object.keys(MOBILE_TOOL_ALIASES).length).toBeGreaterThanOrEqual(15);
    expect(Object.keys(MOBILE_TOOL_TO_MANAGEMENT_PANEL).length).toBeGreaterThanOrEqual(30);
    expect(PANNEAUX_CANONIQUES.size).toBeGreaterThanOrEqual(30);
  });
});
