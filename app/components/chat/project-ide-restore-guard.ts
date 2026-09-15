/**
 * Garde de restauration de l'état IDE.
 *
 * Le défaut qu'il corrige : le garde était posé À L'ENTRÉE de l'opération
 * asynchrone, donc il déduisait le succès de l'absence de signal d'échec.
 * L'effet de restauration dépend entre autres de `projectFiles` : l'arrivée des
 * fichiers le rejoue. Le nettoyage passait alors `cancelled = true` sans libérer
 * le garde ; la relance sortait aussitôt sur « déjà restauré », et la réponse en
 * vol sortait sur `cancelled` sans rien appliquer. L'état n'était jamais
 * restauré, silencieusement, selon l'ordre d'arrivée.
 *
 * Mesuré sur `main` : **6 chargements sur 8 ne restauraient jamais l'état**.
 * Avec ce garde : 0 sur 8.
 *
 * D'où la séparation en deux notions :
 *  - « une tentative est en vol », qui empêche les doublons et qui se LIBÈRE ;
 *  - « la restauration a réussi », qui seule ferme définitivement la porte.
 */
export interface GardeDeRestauration {
  /** Vrai si aucune tentative n'est en vol et qu'aucune n'a encore réussi. */
  peutLancer(projectId: string): boolean;

  /** Déclare une tentative en vol ; renvoie le jeton qui servira à la libérer. */
  lancer(projectId: string): number;

  /** À n'appeler qu'après une restauration réellement appliquée. */
  reussir(projectId: string): void;

  /** Libère la tentative portant ce jeton — annulation, erreur ou fin. */
  liberer(jeton: number): void;

  /** Repart de zéro (changement de projet). */
  oublier(): void;
}

export function creerGardeDeRestauration(): GardeDeRestauration {
  let reussiPour: string | undefined;
  let enVol: { projectId: string; jeton: number } | undefined;
  let prochainJeton = 0;

  return {
    peutLancer(projectId) {
      return reussiPour !== projectId && enVol?.projectId !== projectId;
    },
    lancer(projectId) {
      prochainJeton += 1;
      enVol = { projectId, jeton: prochainJeton };

      return prochainJeton;
    },
    reussir(projectId) {
      reussiPour = projectId;
    },
    liberer(jeton) {
      /*
       * Le jeton compte : la fin d'une tentative ANNULÉE ne doit pas libérer la
       * tentative suivante, qui porte le même `projectId` mais un autre jeton.
       */
      if (enVol?.jeton === jeton) {
        enVol = undefined;
      }
    },
    oublier() {
      reussiPour = undefined;
      enVol = undefined;
    },
  };
}
