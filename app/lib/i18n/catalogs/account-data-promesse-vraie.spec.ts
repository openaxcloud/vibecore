import { describe, expect, it } from 'vitest';
import { getAccountDataPageCopy } from './account-data';

/*
 * BUG-QA1006-SUPPRESSION-DE-COMPTE-JAMAIS-EXECUTEE — vérifié le 2026-10-11 sur
 * `main` : aucune ligne n'écrit `purgedAt`, aucune tâche ne lit les demandes en
 * attente (seule la page d'administration les liste), et la tâche d'inactivité
 * tourne à blanc (`INACTIVITY_GC_ENABLED` absent). Rien n'efface un compte.
 *
 * L'écran promettait pourtant « Vos données seront définitivement supprimées le
 * {date} », puis « La suppression définitive de votre compte est en cours ».
 * Décision du 2026-10-11 : le texte dit ce qui se passe RÉELLEMENT — demande
 * enregistrée, visible par l'équipe, annulable 14 jours, suppression définitive
 * pas encore automatique. Aucune nouvelle promesse.
 */

const PROMESSES_FAUSSES =
  /permanently removed on|will be permanently deleted|permanent deletion is now in progress|deletion is permanent after|schedules your account for permanent deletion|scheduled for deletion|définitivement supprimées? le|sera définitivement supprimé|suppression définitive de votre compte est en cours|suppression est définitive|programme la suppression définitive|suppression de votre compte est programmée/iu;

const VERITE = { en: /not automatic yet/iu, fr: /pas encore automatique/iu } as const;

/** Toutes les chaînes visibles du bloc « compte et données », à plat. */
function chaines(valeur: unknown): string[] {
  if (typeof valeur === 'string') {
    return [valeur];
  }

  if (valeur && typeof valeur === 'object') {
    return Object.values(valeur).flatMap(chaines);
  }

  return [];
}

describe('suppression de compte — l’écran ne promet pas ce que rien n’exécute', () => {
  for (const langue of ['en', 'fr'] as const) {
    it(`${langue} : aucune promesse d’effacement automatique à date, et la vérité est dite`, () => {
      const copie = getAccountDataPageCopy(langue);
      const textes = chaines(copie);

      // Témoin : on lit bien les textes de la page (sinon la garde ne mesure rien).
      expect(textes.length).toBeGreaterThan(30);

      // Mesuré AVANT correctif : « Your data will be permanently removed on {date}. », etc.
      expect(textes.filter((texte) => PROMESSES_FAUSSES.test(texte))).toEqual([]);

      // Ce qui se passe réellement est écrit : dans le dialogue de confirmation ET dans l'état « délai écoulé ».
      expect(chaines(copie.dialog).join(' ')).toMatch(VERITE[langue]);
      expect(copie.status.readyDescription).toMatch(VERITE[langue]);
    });
  }
});
