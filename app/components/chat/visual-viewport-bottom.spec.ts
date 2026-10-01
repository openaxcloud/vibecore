import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  clavierProbablementOuvert,
  decalageAAnnulerClavierOuvert,
  recouvrementBasDuNavigateur,
  retrecissementDeLaVue,
  revelerLeChampActif,
  champSaisissable,
  suivreHauteurDeRepos,
  SEUIL_CLAVIER_PX,
} from './visual-viewport-bottom';

/*
 * La fonction est IMPORTÉE du module que le composant utilise. Une première
 * version la redéfinissait dans le fichier de test : elle aurait été verte quoi
 * qu'il arrive au produit — c'est le défaut de méthode le plus coûteux qu'on ait
 * identifié aujourd'hui, un test qui protège sa propre copie.
 */

describe('recouvrement bas du navigateur', () => {
  it('vaut la hauteur de la barre Safari quand elle est affichée', () => {
    // iPhone 15 Pro : 852 de mise en page, 765 de visuel quand la barre est là.
    expect(recouvrementBasDuNavigateur(852, { height: 765, offsetTop: 0 })).toBe(87);
  });

  it('retombe à zéro quand la barre est masquée', () => {
    expect(recouvrementBasDuNavigateur(852, { height: 852, offsetTop: 0 })).toBe(0);
  });

  it('tient compte du décalage quand la page est zoomée ou décalée', () => {
    expect(recouvrementBasDuNavigateur(852, { height: 700, offsetTop: 50 })).toBe(102);
  });

  it('ne rend jamais de valeur négative — une réserve négative repousserait le panneau SOUS la barre', () => {
    expect(recouvrementBasDuNavigateur(600, { height: 800, offsetTop: 0 })).toBe(0);
  });

  it('vaut zéro sans `visualViewport` — on ne réserve pas ce qu’on ne sait pas mesurer', () => {
    expect(recouvrementBasDuNavigateur(852, undefined)).toBe(0);
  });
});

describe('clavier probablement ouvert', () => {
  it('la barre Safari seule (44 à 84 px) n’est pas un clavier', () => {
    expect(clavierProbablementOuvert(0)).toBe(false);
    expect(clavierProbablementOuvert(44)).toBe(false);
    expect(clavierProbablementOuvert(84)).toBe(false);
  });

  it('un clavier iPhone (260 à 340 px) l’est, dès le seuil', () => {
    expect(clavierProbablementOuvert(SEUIL_CLAVIER_PX)).toBe(true);
    expect(clavierProbablementOuvert(260)).toBe(true);
    expect(clavierProbablementOuvert(340)).toBe(true);
  });
});

describe('BUG-KEYBOARD-ZOOM-001 — clavier iOS : détection par le rétrécissement, décalage annulé', () => {
  /*
   * Capture d'Avi du 08/09 07:58 : clavier levé, Safari a fait défiler le
   * document (offsetTop 475 sur une mise en page de 844, vue de 369). Le
   * recouvrement bas vaut 0 : l'ancienne détection disait « pas de clavier ».
   */
  it('voit le clavier même quand Safari a fait défiler le document', () => {
    const vue = { height: 369, offsetTop: 475 };

    expect(recouvrementBasDuNavigateur(844, vue)).toBe(0);
    expect(clavierProbablementOuvert(recouvrementBasDuNavigateur(844, vue))).toBe(false);
    expect(retrecissementDeLaVue(844, vue)).toBe(475);
    expect(clavierProbablementOuvert(retrecissementDeLaVue(844, vue))).toBe(true);
  });

  it('ne prend pas la barre Safari (87 px) pour un clavier, ni un défilement sans clavier', () => {
    expect(clavierProbablementOuvert(retrecissementDeLaVue(852, { height: 765, offsetTop: 0 }))).toBe(false);
    expect(decalageAAnnulerClavierOuvert(852, { height: 765, offsetTop: 200 })).toBe(0);
    expect(decalageAAnnulerClavierOuvert(844, undefined)).toBe(0);
  });

  it('rend le décalage à annuler quand le clavier est ouvert', () => {
    expect(decalageAAnnulerClavierOuvert(844, { height: 369, offsetTop: 475 })).toBe(475);
    expect(decalageAAnnulerClavierOuvert(844, { height: 369, offsetTop: 0 })).toBe(0);
    expect(decalageAAnnulerClavierOuvert(844, { height: 369, offsetTop: 12.6 })).toBe(13);
  });

  it('BaseChat détecte par le rétrécissement et remonte le document quand le clavier est ouvert', () => {
    const baseChat = readFileSync(new URL('./BaseChat.tsx', import.meta.url).pathname, 'utf8');

    /*
     * Depuis le 30/09 (iOS 26) : la référence est la hauteur AU REPOS, jamais
     * `window.innerHeight` du moment — Safari la rétrécit avec le clavier.
     */
    expect(baseChat).toContain('clavierProbablementOuvert(retrecissementDeLaVue(repos.hauteur, vue ?? undefined))');
    expect(baseChat).toContain('decalageAAnnulerClavierOuvert(repos.hauteur, vue ?? undefined)');
    expect(baseChat).toContain('repos = suivreHauteurDeRepos(repos, window.innerWidth, window.innerHeight);');
    expect(baseChat).not.toMatch(/retrecissementDeLaVue\(window\.innerHeight/u);
    expect(baseChat).not.toMatch(/decalageAAnnulerClavierOuvert\(window\.innerHeight/u);
    expect(baseChat).toContain('window.scrollTo(0, 0);');
  });
});

describe('Safari iOS 26 — la fenêtre de mise en page rétrécit AVEC le clavier', () => {
  /*
   * Valeurs relevées le 2026-09-30 dans l'IDE, Safari iOS 26 simulé (390 pt) :
   * au repos innerHeight 699, vue 699 ; clavier levé innerHeight 362, vue 362,
   * offsetTop 337, scrollY 337.
   */
  const repos = { height: 699, offsetTop: 0 };
  const clavier = { height: 362, offsetTop: 337 };

  it('l’ancienne référence (`innerHeight` du moment) ne voit PAS ce clavier — c’est le défaut', () => {
    expect(clavierProbablementOuvert(retrecissementDeLaVue(362, clavier))).toBe(false);
    expect(decalageAAnnulerClavierOuvert(362, clavier)).toBe(0);
  });

  it('la hauteur au repos le voit, et rend le défilement de 337 à annuler', () => {
    let r = suivreHauteurDeRepos(undefined, 390, 699);
    expect(clavierProbablementOuvert(retrecissementDeLaVue(r.hauteur, repos))).toBe(false);

    r = suivreHauteurDeRepos(r, 390, 362);
    expect(r.hauteur).toBe(699);
    expect(retrecissementDeLaVue(r.hauteur, clavier)).toBe(337);
    expect(clavierProbablementOuvert(retrecissementDeLaVue(r.hauteur, clavier))).toBe(true);
    expect(decalageAAnnulerClavierOuvert(r.hauteur, clavier)).toBe(337);
  });

  it('clavier refermé : plus de clavier', () => {
    const r = suivreHauteurDeRepos(suivreHauteurDeRepos(undefined, 390, 699), 390, 362);
    expect(clavierProbablementOuvert(retrecissementDeLaVue(suivreHauteurDeRepos(r, 390, 699).hauteur, repos))).toBe(
      false,
    );
  });

  it('la barre Safari qui se replie puis revient n’est pas un clavier', () => {
    let r = suivreHauteurDeRepos(undefined, 390, 699);
    r = suivreHauteurDeRepos(r, 390, 786);
    r = suivreHauteurDeRepos(r, 390, 699);
    expect(r.hauteur).toBe(786);
    expect(clavierProbablementOuvert(retrecissementDeLaVue(r.hauteur, { height: 699, offsetTop: 0 }))).toBe(false);
  });

  it('une rotation repart de la hauteur du moment — sinon le paysage passerait pour un clavier', () => {
    let r = suivreHauteurDeRepos(undefined, 390, 699);
    r = suivreHauteurDeRepos(r, 844, 340);
    expect(r).toEqual({ largeur: 844, hauteur: 340 });
    expect(clavierProbablementOuvert(retrecissementDeLaVue(r.hauteur, { height: 340, offsetTop: 0 }))).toBe(false);
  });
});

describe('clavier levé : le champ actif reste visible (Paramètres, 30/09)', () => {
  // Éléments minimaux : la fonction ne lit que tagName, type, isContentEditable et scrollIntoView.
  const element = (tagName: string, type = '', isContentEditable = false) => {
    const appels: unknown[] = [];
    const el = { tagName, type, isContentEditable, scrollIntoView: (o?: unknown) => appels.push(o) };

    return { el: el as unknown as Element, appels };
  };

  const doc = (actif: Element | null) => ({ activeElement: actif }) as unknown as Document;

  it('ramène le champ actif dans sa zone de défilement, au plus près', () => {
    const { el, appels } = element('INPUT', 'text');

    expect(revelerLeChampActif(doc(el))).toBe(true);
    expect(appels).toEqual([{ block: 'nearest', inline: 'nearest' }]);

    for (const [balise, type, editable] of [
      ['TEXTAREA', '', false],
      ['SELECT', '', false],
      ['DIV', '', true],
    ] as const) {
      expect(champSaisissable(element(balise, type, editable).el), balise).toBe(true);
    }
  });

  it('ne fait rien sans champ de saisie actif (bouton, case à cocher, rien)', () => {
    const bouton = element('BUTTON');

    expect(revelerLeChampActif(doc(bouton.el))).toBe(false);
    expect(bouton.appels).toEqual([]);
    expect(champSaisissable(element('INPUT', 'checkbox').el)).toBe(false);
    expect(revelerLeChampActif(doc(null))).toBe(false);
  });

  it('BaseChat le fait dès que le clavier est vu — pas seulement quand Safari a décalé la page', () => {
    const baseChat = readFileSync(new URL('./BaseChat.tsx', import.meta.url).pathname, 'utf8');

    const branche = baseChat.slice(
      baseChat.indexOf('if (clavierProbablementOuvert(retrecissementDeLaVue(repos.hauteur'),
      baseChat.indexOf("document.documentElement.removeAttribute('data-vc-clavier');"),
    );

    expect(branche).toContain('revelerLeChampActif(document);');

    // Hors du bloc `scrollTo` : au passage 14 le décalage valait 0, ce bloc ne s'exécutait pas.
    expect(branche.indexOf('revelerLeChampActif(document);')).toBeGreaterThan(
      branche.indexOf('window.scrollTo(0, 0);\n          }'),
    );
  });
});

/**
 * BUG-KEYBOARD-MOBILE-001 — LA MOITIÉ QUE PERSONNE NE TENAIT.
 *
 * Tout le reste du correctif est épinglé : le seuil et les deux fonctions de
 * décision le sont ici même, la feuille de style et la pose de l'attribut le
 * sont par `app/styles/ide-mobile-panels.spec.ts` (§9). Il restait une ligne
 * porteuse que RIEN ne protégeait — celle qui abonne la mesure aux événements
 * de la fenêtre visuelle.
 *
 * Pourquoi elle porte tout : sur iOS, la levée du clavier logiciel ne déclenche
 * PAS `window.resize` ; elle ne se manifeste que par `visualViewport`. Retirer
 * ces deux abonnements laisse donc VERTES toutes les gardes existantes — la
 * fonction de décision est intacte, le CSS est intact, l'appel est intact — et
 * la fonction est morte sur le téléphone d'Avi : la mesure n'est jamais
 * relancée, l'attribut n'est jamais posé, le composeur reste 90 px au-dessus du
 * clavier. C'est très exactement le défaut d'origine, réintroduit sans un seul
 * test rouge (règle 15).
 *
 * La garde vise la RÈGLE et non la ligne (règle 7) : tout événement capable de
 * changer la fenêtre visuelle relance la mesure, et tout abonnement est défait
 * au démontage. Ajouter demain un troisième événement sans son retrait fera
 * rougir la symétrie.
 *
 * NON MESURABLE AUTREMENT : `BaseChat` n'est monté nulle part en jsdom (23 816
 * lignes, 135 imports de module, `ChartJS.register` au chargement — les ~18
 * specs qui le nomment le LISENT toutes), et un moteur sans écran tactile n'a
 * pas de clavier logiciel à lever. La garde est donc statique, comme celles de
 * §9 — et elle le dit plutôt que de se déguiser en preuve de comportement.
 */
describe('BUG-KEYBOARD-MOBILE-001 — la mesure est abonnée à la fenêtre visuelle', () => {
  /** Retire les commentaires : une garde ne doit jamais compter sa propre prose (règle 5). */
  function sansCommentaires(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
  }

  /** L'effet clavier SEUL — pas les 23 816 lignes du fichier. */
  function effetClavier(): string {
    const baseChat = readFileSync(new URL('./BaseChat.tsx', import.meta.url).pathname, 'utf8');
    const debut = baseChat.indexOf('const updateVisualViewportHeight = () => {');
    const fin = baseChat.indexOf('}, [useMobileIde]);', debut);

    /*
     * Règle 14 : un « 0 résultat » n'informe que si la recherche a porté. Ces
     * trois contrôles disent que l'extraction a bien trouvé SON effet, et pas
     * le fichier entier par accident.
     */
    expect(debut, 'l’effet clavier est introuvable dans BaseChat — la garde ne mesure plus rien').toBeGreaterThan(-1);
    expect(fin, 'la fin de l’effet clavier est introuvable — la garde ne mesure plus rien').toBeGreaterThan(debut);

    const effet = sansCommentaires(baseChat.slice(debut, fin));

    // Témoin positif : l'extrait contient bien ce que l'effet est censé faire.
    expect(effet, 'témoin positif absent : l’extrait n’est pas l’effet clavier').toContain('data-vc-clavier');
    expect(effet.length, 'l’extrait fait la taille du fichier : il n’a rien narrowé').toBeLessThan(baseChat.length / 2);

    return effet;
  }

  it('s’abonne au redimensionnement ET au défilement de `visualViewport` — sans quoi iOS ne dit jamais que le clavier est là', () => {
    const effet = effetClavier();

    expect(
      effet,
      'le clavier iOS ne déclenche pas `window.resize` : sans cet abonnement, la mesure n’est jamais relancée',
    ).toContain("window.visualViewport?.addEventListener('resize', updateVisualViewportHeight)");

    expect(
      effet,
      'Safari fait DÉFILER le document pour garder le champ visible (BUG-KEYBOARD-ZOOM-001) : sans cet abonnement, le décalage n’est jamais annulé',
    ).toContain("window.visualViewport?.addEventListener('scroll', updateVisualViewportHeight)");

    // Le redimensionnement de fenêtre reste le repli des moteurs sans `visualViewport`.
    expect(effet).toContain("window.addEventListener('resize', updateVisualViewportHeight)");
  });

  it('défait au démontage exactement ce qu’il a posé — aucun abonnement orphelin', () => {
    const effet = effetClavier();

    const poses = [...effet.matchAll(/\.addEventListener\('([a-z]+)', updateVisualViewportHeight\)/g)].map((m) => m[1]);

    const retires = [...effet.matchAll(/\.removeEventListener\('([a-z]+)', updateVisualViewportHeight\)/g)].map(
      (m) => m[1],
    );

    // Règle 14 bis : un compte à zéro des deux côtés serait « symétrique » et vide.
    expect(poses.length, 'aucun abonnement trouvé : la mesure ne se relance jamais').toBeGreaterThanOrEqual(3);
    expect(retires.sort(), `posés ${poses.sort().join()} / retirés ${retires.sort().join()}`).toEqual(poses.sort());
  });
});
