import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { demarrageBloque, msDepuisLeDernierProgres, SEUIL_DEMARRAGE_BLOQUE_MS } from './demarrage-bloque';
import { idePanelsEn, idePanelsFr } from '~/lib/i18n/catalogs/ide-panels';

/*
 * BUG-IDE-006. Le défaut n'était pas « le démarrage a échoué » — c'est arrivé,
 * et c'était un artefact d'environnement (une NetworkPolicy DNS manquante, hors
 * de portée du navigateur). Le défaut est que RIEN ne le disait : pendant vingt
 * minutes, l'écran d'un démarrage impossible était identique à celui d'un
 * démarrage lent.
 *
 * Ces tests tiennent les deux bords du seuil, parce qu'un seuil ne vaut que par
 * ce qu'il laisse passer : un démarrage sain ne doit JAMAIS être annoncé comme
 * bloqué — un faux « c'est planté » sur une installation qui avance serait un
 * mensonge d'état de plus, exactement ce qu'on corrige.
 */

describe('BUG-IDE-006 — un démarrage qui n’avance plus est nommé', () => {
  it('un démarrage sain n’est jamais annoncé comme bloqué', () => {
    // `npm install` à froid : 30 à 90 s, et l'étape avance en chemin.
    expect(demarrageBloque(0)).toBe(false);
    expect(demarrageBloque(30_000)).toBe(false);
    expect(demarrageBloque(90_000)).toBe(false);
    expect(demarrageBloque(SEUIL_DEMARRAGE_BLOQUE_MS - 1)).toBe(false);
  });

  it('le silence de la capture du 12/08 l’est, et dès le seuil', () => {
    expect(demarrageBloque(SEUIL_DEMARRAGE_BLOQUE_MS)).toBe(true);
    expect(demarrageBloque(20 * 60_000), 'les 20 minutes observées').toBe(true);
  });

  it('le seuil laisse une marge large au-dessus d’une installation à froid', () => {
    /*
     * Règle 5 : ancrer sur le CODE, pas sur la prose. Le commentaire du module
     * justifie le seuil par deux bornes ; ce test les impose. Descendre le
     * seuil sous 120 s ferait clignoter « bloqué » sur des installations
     * saines ; le monter au-delà de 10 min ramènerait le silence d'origine.
     */
    expect(SEUIL_DEMARRAGE_BLOQUE_MS).toBeGreaterThanOrEqual(120_000);
    expect(SEUIL_DEMARRAGE_BLOQUE_MS).toBeLessThanOrEqual(600_000);
  });

  it('une mesure impossible ne fabrique pas un blocage', () => {
    /*
     * Un `NaN` ou un `Infinity` viendrait d'une horloge ou d'un état absent.
     * Répondre « bloqué » là-dessus remplacerait un mensonge d'état par un
     * autre : sans mesure, on ne dit rien.
     */
    expect(demarrageBloque(Number.NaN)).toBe(false);
    expect(demarrageBloque(Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe('temps écoulé depuis le dernier progrès', () => {
  it('compte depuis le dernier CHANGEMENT d’étape, pas depuis le début', () => {
    expect(msDepuisLeDernierProgres(1_000, 4_000)).toBe(3_000);
  });

  it('sans horodatage, il n’y a rien à compter', () => {
    expect(msDepuisLeDernierProgres(undefined, 10_000)).toBe(0);
    expect(msDepuisLeDernierProgres(Number.NaN, 10_000)).toBe(0);
  });

  it('une horloge qui recule ne déclenche pas un blocage', () => {
    expect(msDepuisLeDernierProgres(10_000, 4_000)).toBe(0);
    expect(demarrageBloque(msDepuisLeDernierProgres(10_000, 4_000))).toBe(false);
  });

  it('bout en bout : le cas de la capture, composé des deux fonctions', () => {
    const debutDeLEtape = 1_000_000;
    const vingtMinutesPlusTard = debutDeLEtape + 20 * 60_000;

    expect(demarrageBloque(msDepuisLeDernierProgres(debutDeLEtape, vingtMinutesPlusTard))).toBe(true);
    expect(demarrageBloque(msDepuisLeDernierProgres(debutDeLEtape, debutDeLEtape + 60_000))).toBe(false);
  });
});

/*
 * LA MOITIÉ QUI SE PERD, et c'est la leçon de toute la campagne : un module
 * juste que PERSONNE N'APPELLE ne corrige rien. Le 2026-08-18, un correctif
 * parfaitement juste sur la constructibilité de l'image admin n'a rien changé
 * pendant 56 jours, parce qu'aucun pipeline ne construisait cette image.
 *
 * Les huit tests ci-dessus tiennent la DÉCISION. Ceux-ci tiennent le CÂBLAGE :
 * sans eux, retirer `bloque` d'un des deux écrans les laisserait tous verts
 * pendant que l'utilisateur retrouve son rouet muet (règle 15).
 */
describe('BUG-IDE-006 — le module est vraiment câblé aux DEUX écrans de démarrage', () => {
  const PREVIEW = readFileSync(new URL('../../components/workbench/Preview.tsx', import.meta.url).pathname, 'utf8');

  /** Retire les commentaires : une garde ne compte jamais sa propre prose (règle 5). */
  const sansCommentaires = (source: string) =>
    source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, ' ');

  const PREVIEW_NU = sansCommentaires(PREVIEW);

  it('témoin positif : le fichier lu est bien celui du panneau Aperçu', () => {
    // Règle 14 : un « 0 résultat » n'informe que si la lecture a porté.
    expect(PREVIEW_NU.length, 'Preview.tsx est vide ou introuvable').toBeGreaterThan(10_000);
    expect(PREVIEW_NU).toContain('PreviewSplashSequence');
    expect(PREVIEW_NU).toContain('PreviewLoadingOverlay');
  });

  it('Preview.tsx importe la décision au lieu d’en refaire une copie', () => {
    expect(PREVIEW_NU).toContain("from '~/lib/ide/demarrage-bloque'");
    expect(PREVIEW_NU).toContain('demarrageBloque(msDepuisLeDernierProgres(');
  });

  it('les DEUX écrans reçoivent l’état, et la relance avec (règle 7)', () => {
    /*
     * Un seul des deux suffirait à laisser le défaut d'origine sur l'autre
     * chemin : l'utilisateur ne choisit pas quel écran il voit.
     */
    expect(
      PREVIEW_NU.match(/bloque=\{demarrageEstBloque\}/g)?.length,
      'un des deux écrans de démarrage ne reçoit pas l’état « bloqué »',
    ).toBe(2);
    expect(
      PREVIEW_NU.match(/onRelancer=\{relancerLeDemarrage\}/g)?.length,
      'un des deux écrans n’offre pas de sortie',
    ).toBe(2);
  });

  it('le silence se compte depuis le CHANGEMENT D’ÉTAPE, pas depuis l’ouverture', () => {
    /*
     * C'est ce qui empêche d'annoncer « bloqué » sur une installation lente qui
     * progresse. Si l'effet cessait de dépendre de l'étape, le compteur ne
     * repartirait plus et tout démarrage de plus de trois minutes serait
     * accusé — un mensonge d'état de plus.
     */
    expect(PREVIEW_NU).toMatch(/\}, \[etapeDeDemarrage, unEcranDeDemarrageEstVisible\]\);/);
  });

  it('le rouet DISPARAÎT quand plus rien n’avance', () => {
    /*
     * Un rouet qui tourne AFFIRME une progression. Le laisser sous un message
     * « ça n'avance plus » remettrait les deux affirmations contradictoires que
     * ce point corrige — la faute de BUG-UX-014 et BUG-PREVIEW-REMOUNT-001.
     */
    expect(PREVIEW_NU).toContain('isBusy && !bloque ?');
    expect(PREVIEW_NU).toMatch(/bloque \?\s*\(?\s*<span className="bolt-preview-loading-spinner i-ph:warning-circle"/);
  });

  it('les trois phrases existent dans les DEUX langues, et sont distinctes', () => {
    /*
     * Une clé sans phrase rend une chaîne vide : l'utilisateur verrait un encart
     * VIDE là où on lui promet une explication — pire que le rouet muet.
     */
    for (const cle of ['stalledTitle', 'stalledBody', 'stalledRestart'] as const) {
      expect(idePanelsEn[`idePanels.preview.${cle}`], `en/${cle}`).toBeTruthy();
      expect(idePanelsFr[`idePanels.preview.${cle}`], `fr/${cle}`).toBeTruthy();
      expect(idePanelsFr[`idePanels.preview.${cle}`], `fr/${cle} n’est pas traduit`).not.toBe(
        idePanelsEn[`idePanels.preview.${cle}`],
      );
    }
  });
});
