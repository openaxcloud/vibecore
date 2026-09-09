import { describe, expect, it } from 'vitest';

import { chatFr } from './chat';

/*
 * BUG-I18N-006 — « l'environnement de déploiement est étiqueté avec des mots
 * hors domaine ».
 *
 * Deux artefacts de traduction automatique, vivants et mesurés le 09/09 :
 *
 *   production → « Fabrication »     (l'usine, pas le déploiement)
 *   staging    → « Mise en scène »   (le théâtre)
 *
 * Ils s'affichaient dans les sélecteurs d'environnement de l'IDE : un
 * utilisateur qui déploie choisissait « Fabrication ». Le mot juste, en
 * français technique comme dans le reste de notre produit, est « Production »
 * et « Préproduction » — c'est déjà la convention du catalogue des bases
 * (`databaseWorkbench.env.*`), que ces deux clés contredisaient.
 *
 * Ce test vise la RÈGLE, pas les deux occurrences (règle 7) : aucun nom
 * d'environnement ne doit porter un mot d'un autre domaine. Un troisième
 * passage de traduction automatique se ferait attraper.
 */

/** Mots dont la présence dans un nom d'environnement signale une traduction hors domaine. */
const HORS_DOMAINE = ['fabrication', 'mise en scène', 'échafaudage', 'scène', 'usine', 'manufacture', 'intermédiaire'];

describe('noms d’environnement de déploiement en français', () => {
  it('« production » et « staging » portent les mots du métier', () => {
    expect(chatFr['chat.copy.production_df70fc79']).toBe('Production');
    expect(chatFr['chat.copy.staging_c9fb656c']).toBe('Préproduction');
  });

  it('aucun libellé d’environnement ne tombe dans un autre domaine', () => {
    const suspects: Array<[string, string]> = [];

    for (const [cle, valeur] of Object.entries(chatFr)) {
      if (typeof valeur !== 'string') {
        continue;
      }

      if (!/(production|staging|preview|development|environment|environnement)/iu.test(cle)) {
        continue;
      }

      const bas = valeur.toLowerCase();

      if (HORS_DOMAINE.some((mot) => bas.includes(mot))) {
        suspects.push([cle, valeur]);
      }
    }

    expect(suspects, `libellés hors domaine : ${JSON.stringify(suspects)}`).toEqual([]);
  });

  it('la sonde regarde bien un catalogue rempli — sinon elle ne prouve rien', () => {
    expect(Object.keys(chatFr).length, 'catalogue français non vide').toBeGreaterThan(100);
  });
});
