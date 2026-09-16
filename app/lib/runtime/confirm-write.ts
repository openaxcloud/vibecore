/**
 * Relecture BORNÉE d'un fichier après son écriture.
 *
 * La relecture qui rend le statut « Terminé » honnête (BUG-AGENT-002) n'avait
 * pas de délai à elle : elle héritait du budget de l'adaptateur — quatre
 * tentatives de 30 s, plus un re-provisionnement d'espace de travail dont
 * l'attente de disponibilité se compte en minutes. Constaté en production :
 * une tâche « En cours » pendant huit minutes sur UN fichier, sans nouvelle
 * ligne dans l'arbre, sans erreur, sans fin — pendant que l'aperçu accumulait
 * les erreurs Vite.
 *
 * Une confirmation de lecture sur un pod sain prend moins d'une seconde. Au-delà
 * de quelques secondes, ce n'est plus de la latence : c'est un échec, et le dire
 * vaut mieux que de faire attendre.
 *
 * La promesse sous-jacente n'est pas annulée — l'adaptateur n'expose pas de
 * signal ici, et une écriture déjà partie doit suivre son cours. Ce que cette
 * fonction garantit, c'est que l'INTERFACE cesse d'attendre : on ne laisse
 * jamais une action « En cours » sans borne.
 */
export const WRITE_CONFIRMATION_TIMEOUT_MS = 15_000;

export type ConfirmationOutcome = 'confirmed' | 'unreadable' | 'timeout';

export async function confirmWriteWithinDeadline(
  read: () => Promise<unknown>,
  timeoutMs: number = WRITE_CONFIRMATION_TIMEOUT_MS,
): Promise<ConfirmationOutcome> {
  let minuteur: ReturnType<typeof setTimeout> | undefined;

  const echeance = new Promise<'timeout'>((resolve) => {
    minuteur = setTimeout(() => resolve('timeout'), timeoutMs);
  });

  try {
    /*
     * `catch` AVANT la course : une lecture qui échoue vite doit rendre
     * « unreadable » tout de suite, pas attendre l'échéance.
     */
    const lecture = read().then(
      () => 'confirmed' as const,
      () => 'unreadable' as const,
    );

    return await Promise.race([lecture, echeance]);
  } finally {
    if (minuteur) {
      clearTimeout(minuteur);
    }
  }
}
