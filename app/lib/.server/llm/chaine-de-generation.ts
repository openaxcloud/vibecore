/**
 * SUIVI D'UNE CHAÎNE DE GÉNÉRATION QUI DOIT SURVIVRE À `execute`.
 *
 * Le SDK `ai` ferme le flux de données dès que la fonction `execute` a rendu la
 * main ET que les flux déjà fusionnés sont épuisés. Or une réponse longue est
 * découpée en segments : le premier se termine, son `onFinish` lance le suivant
 * et le fusionne — après la fermeture. Le SDK avale alors cette fusion en
 * silence (son `safeEnqueue` attrape et jette), pendant que le fournisseur
 * continue de générer et que l'organisation est facturée.
 *
 * Mesuré le 2026-09-07 sur sept générations réelles : les trois qui dépassaient
 * la limite de jetons — donc qui continuaient — ont vu leur réponse HTTP se
 * terminer 6 à 9 minutes AVANT la fin de la génération, avec 457 à 64 881
 * octets livrés pour 46 208 à 65 390 jetons produits. Les deux qui tenaient en
 * un seul segment se sont terminées à la seconde près avec la leur.
 *
 * Ce module compte les générations EN VOL. `execute` attend qu'il n'en reste
 * aucune : le compteur ne retombe pas à zéro entre deux segments, puisque le
 * suivant se compte AVANT que le précédent ne se solde.
 */

export interface SuiviDeChaine {
  /** À appeler juste avant chaque appel au fournisseur. */
  debut(): void;

  /** À appeler quand un segment se termine, quelle qu'en soit l'issue. */
  fin(): void;

  /** Nombre de générations actuellement en vol (lecture, pour le journal). */
  enVol(): number;

  /**
   * Se résout quand la chaîne est finie, ou quand le délai maximal est atteint.
   *
   * Rend `true` si le délai a été atteint — c'est-à-dire si un `onFinish` n'est
   * jamais venu. **On ne remplace pas un silence par une attente sans fin** :
   * une requête qui ne se termine jamais est pire pour l'utilisateur qu'un
   * écran figé, et elle retient des ressources côté serveur.
   */
  attendre(): Promise<boolean>;
}

export function creerSuiviDeChaine(delaiMaxMs: number): SuiviDeChaine {
  let enVol = 0;
  let resoudre: () => void = () => {};

  const terminee = new Promise<void>((r) => {
    resoudre = r;
  });

  return {
    debut() {
      enVol += 1;
    },
    fin() {
      enVol -= 1;

      if (enVol <= 0) {
        resoudre();
      }
    },
    enVol() {
      return enVol;
    },
    async attendre() {
      let borne: ReturnType<typeof setTimeout> | undefined;

      const depasse = await Promise.race([
        terminee.then(() => false),
        new Promise<boolean>((r) => {
          borne = setTimeout(() => r(true), delaiMaxMs);
        }),
      ]);

      if (borne) {
        clearTimeout(borne);
      }

      return depasse;
    },
  };
}
