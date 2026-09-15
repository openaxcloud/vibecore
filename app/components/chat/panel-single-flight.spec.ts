import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * BUG-PANEL-PERF-004 — le chargeur de panneau doit passer par la mise en commun
 * des appels en vol.
 *
 * POURQUOI CE TEST EXISTE. `loadPanel` possédait déjà une garde,
 * `loadingPanelRef`, et elle fonctionnait : elle empêche une même instance
 * d'empiler ses appels. Elle ne coordonne pas les instances entre elles. Trois
 * panneaux montés en parallèle donnaient donc trois gardes correctes et trois
 * requêtes — mesuré en production le 2026-09-05 : trois appels à
 * `/ide-panel/overview` aux piles d'appel identiques, 5 à 7 s de serveur chacun
 * pour ~100 Ko, contre 1,8 à 2,2 s pour le même appel isolé.
 *
 * Une garde qui protège l'instance sans coordonner les instances donne
 * l'ILLUSION d'être protégé. C'est ce que ce test empêche de réintroduire :
 * si quelqu'un « simplifie » en retirant la mise en commun au motif qu'une
 * garde existe déjà, il rougit.
 *
 * Ancré sur le CODE (même procédé que `services/api/src/ide-state-files-guard.spec.ts`)
 * faute de pouvoir monter trois instances de BaseChat dans un test unitaire.
 */
const SOURCE = readFileSync(join(__dirname, 'BaseChat.tsx'), 'utf8');

describe('chargement des panneaux — appels en vol mutualisés', () => {
  it('le module importe bien l’utilitaire de mise en commun', () => {
    expect(SOURCE, "BaseChat.tsx n'a pas été lu : le test ne mesure rien").toContain('const loadPanel');
    expect(SOURCE).toContain("from '~/lib/ide/single-flight'");
  });

  it('la mise en commun est de portée MODULE, pas d’instance', () => {
    /*
     * Le critère n'est PAS la position dans le fichier — le panneau est déclaré
     * après `BaseChat`, et ma première version de ce test s'y est trompée. Le
     * critère est l'INDENTATION : une déclaration de portée module commence en
     * colonne 0. Déclarée dans un composant, elle serait recréée à chaque
     * montage et ne coordonnerait rien.
     */
    const ligne = SOURCE.split('\n').find((l) => l.includes('createSingleFlight<{ status: number'));
    expect(ligne, 'déclaration introuvable').toBeTruthy();
    expect(ligne!.startsWith('const '), `déclaration indentée, donc pas de portée module : ${ligne}`).toBe(true);
  });

  it('la requête du panneau passe PAR la mise en commun, et non en direct', () => {
    const debut = SOURCE.indexOf('const loadPanel');
    expect(debut).toBeGreaterThan(-1);
    const corps = SOURCE.slice(debut, debut + 4000);
    expect(corps, 'loadPanel ne mutualise pas son appel').toContain('panneauEnVol.run(');
    // le fetch doit être DANS la fonction mutualisée, pas à côté
    const iRun = corps.indexOf('panneauEnVol.run(');
    const iFetch = corps.indexOf('fetchPanel(`/api/projects/');
    expect(iFetch, 'appel réseau introuvable').toBeGreaterThan(-1);
    expect(iFetch, "le fetch est hors de la mise en commun").toBeGreaterThan(iRun);
  });

  it('la garde de ré-entrance est CONSERVÉE — les deux ne couvrent pas le même cas', () => {
    expect(SOURCE).toContain('loadingPanelRef.current');
  });
});

describe('limite assumée de ce garde', () => {
  /*
   * `BaseChat.tsx` porte `// @ts-nocheck` en ligne 2 : le fichier est
   * VOLONTAIREMENT hors du typage (sa propre note indique 16 erreurs si on
   * retire la directive). Aucun `tsc` ne peut donc valider ce changement, et
   * un « 0 erreur » sur ce fichier ne veut rien dire — je l'ai constaté en
   * injectant une erreur de type qui n'a JAMAIS été rapportée.
   *
   * Ce test le rend explicite pour que personne ne croie ce fichier typé.
   */
  it('BaseChat.tsx est hors typage — un « 0 erreur » ne prouve rien ici', () => {
    expect(SOURCE.split('\n').slice(0, 4).join('\n')).toContain('@ts-nocheck');
  });
});
