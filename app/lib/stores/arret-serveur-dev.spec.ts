import { describe, expect, it } from 'vitest';
import { doitArreterLePreview, type RaisonArretPreview } from './preview-recovery';

/*
 * LE DEMONTAGE D'UN COMPOSANT REACT N'EST PAS UN ORDRE D'ARRET.
 *
 * Voir le commentaire de `doitArreterLePreview` pour la mesure de production
 * qui motive cette regle (serveur vivant, page fermee, mort en moins de cinq
 * minutes alors que la fenetre de grace est a dix).
 *
 * Les DEUX sens sont tenus : un serveur qu'on ne peut plus arreter serait un
 * defaut pire que celui qu'on corrige.
 */
describe("le demontage n'arrete pas le serveur, l'utilisateur si", () => {
  it('DEMONTAGE — on ne tue pas', () => {
    expect(doitArreterLePreview('demontage'), 'un demontage tuerait le serveur d Avi').toBe(false);
  });

  it('UTILISATEUR — « Stop » arrete vraiment', () => {
    expect(doitArreterLePreview('utilisateur'), 'le bouton Stop ne tuerait plus rien').toBe(true);
  });

  it('REDEMARRAGE et RESEED sont des intentions : on arrete', () => {
    for (const raison of ['redemarrage', 'reseed'] as const) {
      expect(doitArreterLePreview(raison), `raison=${raison}`).toBe(true);
    }
  });

  it('TEMOIN — sans raison, le comportement historique est conserve', () => {
    /*
     * Sans ce temoin, une fonction qui rendrait TOUJOURS false passerait le
     * premier test et casserait silencieusement les cinq appelants legitimes.
     */
    expect(doitArreterLePreview(undefined)).toBe(true);
  });

  it('TEMOIN — une seule raison s abstient, et une seule', () => {
    const toutes: RaisonArretPreview[] = ['utilisateur', 'redemarrage', 'reseed', 'demontage'];
    expect(toutes.filter((r) => !doitArreterLePreview(r))).toEqual(['demontage']);
  });
});
