/**
 * Loquet « une seule fois », qui se REND en cas d'échec.
 *
 * ## Convergence — à lire avant d'ajouter un consommateur
 *
 * Ce module et `app/components/chat/project-ide-restore-guard.ts` (PR #371)
 * couvrent **le même motif**. Ils ne doivent pas vivre en parallèle : **celle
 * des deux qui atterrit la première fait converger l'autre.**
 *
 * Le garde de #371 est plus fort sur deux points, mesurés en le lisant :
 * il sépare « une tentative est en vol » de « la restauration a réussi », et il
 * délivre un **jeton** pour que la fin d'une tentative ANNULÉE ne libère pas la
 * tentative suivante. Ce module confond les deux états dans un seul booléen —
 * d'où une perte possible : un appelant refusé pendant le vol n'est jamais
 * rejoué, alors que le loquet est ensuite rendu.
 *
 * En clair : si #371 atterrit d'abord, promouvoir son garde ici sous un nom
 * générique et supprimer ce fichier.
 *
 * ## Le défaut que ça évite
 *
 * Une opération asynchrone qu'on ne veut lancer qu'une fois est gardée par une
 * référence : on la pose à l'entrée pour empêcher deux exécutions concurrentes.
 * Poser le loquet est juste. **Ne pas le rendre quand l'opération échoue ou est
 * annulée** ne l'est pas : l'opération n'est alors plus jamais retentée, et rien
 * ne le signale.
 *
 * Mesuré trois fois le 2026-09-01, sous trois formes :
 * - `BaseChat.tsx` — l'état de l'IDE n'était jamais restauré quand les fichiers
 *   arrivaient après la requête (6 chargements sur 8, corrigé par #371) ;
 * - `VercelConnection.tsx` — une auto-connexion échouée n'était plus jamais
 *   retentée ;
 * - `SettingsTab.tsx` — un réglage dont la synchronisation avait échoué restait
 *   local, et revenir à la valeur précédente faisait sauter le correctif.
 *
 * ## La règle
 *
 * **Tout chemin d'échec ou d'annulation doit rendre le loquet.** Le corollaire
 * est plus général : ne jamais déduire le succès de l'ABSENCE d'un signal
 * d'échec.
 *
 * ⚠️ Énoncé corrigé en cours de route : j'avais d'abord écrit « ne poser le
 * loquet qu'après un succès ». C'est faux — la pose à l'entrée est ce qui
 * empêche deux exécutions concurrentes, et le modèle du dépôt la fait. Le
 * défaut n'est pas la pose, c'est l'absence de restitution.
 *
 * ## Pourquoi ce fichier existe
 *
 * La forme juste était déjà écrite, correctement et avec son commentaire, dans
 * `app/components/chat/useProjectAiTranscriptHydration.ts`. Elle n'a été reprise
 * nulle part : personne ne va chercher un motif général dans un hook de
 * transcription. **Une primitive introuvable est une primitive inexistante.**
 */

type Loquet = { current: boolean };

/**
 * Exécute `operation` sous `loquet`, et REND le loquet si elle échoue.
 *
 * Retourne `false` sans rien exécuter quand le loquet est déjà pris — ce qui
 * permet à l'appelant de distinguer « déjà en cours ou déjà fait » de « lancé ».
 *
 * `operation` reçoit `abandonner()` : l'appeler rend le loquet sans traiter le
 * cas comme un échec, pour les sorties anticipées légitimes (composant démonté,
 * réponse vide) où l'on veut qu'un passage ultérieur puisse réessayer.
 */
export async function executerSousLoquet(
  loquet: Loquet,
  operation: (abandonner: () => void) => Promise<void>,
  surEchec?: (erreur: unknown) => void,
): Promise<boolean> {
  if (loquet.current) {
    return false;
  }

  loquet.current = true;

  let abandonne = false;

  const abandonner = () => {
    abandonne = true;
  };

  try {
    await operation(abandonner);

    if (abandonne) {
      loquet.current = false;
    }

    return true;
  } catch (erreur) {
    // Le seul comportement qui compte : rendre le loquet.
    loquet.current = false;

    surEchec?.(erreur);

    return false;
  }
}
