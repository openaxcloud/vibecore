import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  IDE_ADDRESSABLE_PANELS,
  IDE_MANAGEMENT_PANELS,
  IDE_NON_ADDRESSABLE_TAB_KEYS,
  IDE_PANEL_ALIASES,
  isIdeAddressablePanel,
  resolveIdePanelKey,
} from './panel-registry';
import { ECODE_MOBILE_TOOLS, MOBILE_TOOL_ACTIONS, MOBILE_TOOL_TO_MANAGEMENT_PANEL } from '~/lib/mobile-ide-tabs';
import { ECODE_MOBILE_TAB_META_BASE, MOBILE_TOOL_ALIASES, outilCanonique } from '~/lib/mobile-tab-meta';

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

  it("LA TROISIÈME TABLE — celle de l'OUVERTURE, et l'abstention est explicite", () => {
    /*
     * Il existe un troisième vocabulaire d'alias, à un autre étage : celui de
     * l'OUVERTURE. `PROJECT_EDITOR_TOOL_ALIASES` dit quel outil possède
     * réellement l'écran (`domains` → `deployments`, vue `domains`), là où les
     * deux tables ci-dessus disent quel panneau une CLÉ désigne.
     *
     * Ce test garde « un panneau, une porte ». Ignorer une des façons d'ouvrir un
     * panneau, c'est cesser de garder ce qu'on annonce — et le jour où la table
     * arrive, le vert serait SILENCIEUX.
     *
     * ⚠️ ELLE N'EST PAS ENCORE SUR `main` : elle arrive avec #379. Le test doit
     * donc s'ABSTENIR proprement plutôt que rougir sur un module absent — et
     * surtout ne pas passer au vert en croyant avoir vérifié. D'où le verdict
     * explicite ci-dessous : il dit dans QUEL MODE il a tourné. Une cible absente
     * n'est pas une cible saine (règle 20, appliquée à un test).
     */
    const chemin = join(__dirname, '..', '..', 'components', 'chat', 'project-editor-tool-catalog.ts');
    const source = existsSync(chemin) ? readFileSync(chemin, 'utf8') : '';
    const tablePresente = source.includes('PROJECT_EDITOR_TOOL_ALIASES');

    if (!tablePresente) {
      /*
       * Abstention DÉCLARÉE. L'assertion porte sur le fait que le fichier existe
       * et qu'il ne porte pas encore la table — pas sur un `return` muet qui
       * ressemblerait à une vérification réussie.
       */
      expect(existsSync(chemin), 'le catalogue doit exister même sans la table').toBe(true);
      expect(source, "table d'ouverture absente : ce cas n'a RIEN vérifié").not.toContain(
        'PROJECT_EDITOR_TOOL_ALIASES',
      );

      return;
    }

    /*
     * Table présente : les mêmes invariants que pour les deux autres, sur l'axe
     * qui lui est propre.
     */
    const entrees = [...source.matchAll(/^\s+([a-z-]+): \{ tool: '([a-z-]+)', view: '([a-z-]+)' \}/gmu)].map((m) => ({
      cle: m[1],
      cible: m[2],
      vue: m[3],
    }));

    expect(entrees.length, 'la table est déclarée mais aucune entrée lue : le motif a dérivé').toBeGreaterThan(0);

    for (const { cle, cible } of entrees) {
      // 1. la cible possède réellement un écran : elle doit être un panneau adressable
      expect(isIdeAddressablePanel(cible), `cible d'ouverture inconnue : ${cle} → ${cible}`).toBe(true);

      // 2. pas de chaîne : la cible ne doit pas être elle-même une clé d'ouverture
      expect(
        entrees.some((autre) => autre.cle === cible),
        `chaîne d'ouverture : ${cle} → ${cible} → …`,
      ).toBe(false);

      /*
       * 3. la clé reste un panneau adressable — c'est DÉLIBÉRÉ ici, contrairement
       * aux deux autres tables : `?panel=domains` doit continuer à fonctionner.
       * On l'épingle pour que le jour où quelqu'un retire `domains` du registre
       * en croyant « nettoyer un alias », ce test le dise.
       */
      expect(isIdeAddressablePanel(cle), `clé d'ouverture qui n'est plus adressable : ${cle}`).toBe(true);
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

/**
 * LES LIBELLÉS — la seconde moitié de la fidélité du registre.
 *
 * Les tests ci-dessus tiennent le ROUTAGE : une clé, une porte, un panneau.
 * Ceux-ci tiennent le NOM. `mobile-tab-meta.ts` le dit lui-même : ce bloc
 * vivait dans `BaseChat.tsx`, donc hors de la source unique, « et c'est une
 * cause directe des divergences ». Sorti de là, il n'était toujours tenu par
 * AUCUN test — rien n'empêchait un panneau d'arriver sans nom, deux panneaux
 * de porter le même, ou un nom de survivre au panneau qu'il désignait.
 *
 * Mesuré le 2026-09-15 : 31 panneaux adressables, 33 entrées de libellé (les
 * deux en plus sont les ACTIONS `commands` et `share`), 0 doublon, 0 manque,
 * 0 orphelin. C'est l'état sain — ces quatre cas le figent.
 */
describe('un panneau, un nom', () => {
  const libelles = ECODE_MOBILE_TAB_META_BASE;
  const panneaux = [...IDE_ADDRESSABLE_PANELS] as string[];

  it('TÉMOIN — la table des libellés n’est pas vide', () => {
    // Sans ce témoin, une table vidée passerait les trois cas suivants.
    expect(Object.keys(libelles).length).toBeGreaterThanOrEqual(30);
    expect(panneaux.length).toBeGreaterThanOrEqual(30);
  });

  it('chaque panneau adressable a un nom, et un nom non vide', () => {
    const sansNom = panneaux.filter((panneau) => !libelles[panneau]?.name?.trim());

    expect(sansNom, 'panneaux adressables sans libellé — ils s’afficheront par leur identifiant').toEqual([]);
  });

  it('aucun nom n’est porté par deux panneaux — deux portes de même nom sont indiscernables', () => {
    const noms = Object.entries(libelles).map(([id, meta]) => [meta.name, id] as const);
    const parNom = new Map<string, string[]>();

    for (const [nom, id] of noms) {
      parNom.set(nom, [...(parNom.get(nom) ?? []), id]);
    }

    const doublons = [...parNom].filter(([, ids]) => ids.length > 1);

    expect(doublons, 'un même libellé pour plusieurs panneaux').toEqual([]);
  });

  it('aucun nom ne survit au panneau qu’il désignait', () => {
    const connus = new Set<string>([
      ...panneaux,
      ...IDE_NON_ADDRESSABLE_TAB_KEYS,
      ...MOBILE_TOOL_ACTIONS,
      ...ECODE_MOBILE_TOOLS.map((outil) => outil.id),
    ]);

    const orphelins = Object.keys(libelles).filter((id) => !connus.has(id));

    expect(orphelins, 'libellés sans panneau ni outil — BUG-QA-PANEL-META-ORPHANS-001').toEqual([]);
  });
});
