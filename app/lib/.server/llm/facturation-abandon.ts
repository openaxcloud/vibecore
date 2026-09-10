/**
 * FACTURER LE TOUR QUAND L'UTILISATEUR ABANDONNE.
 *
 * `onFinish` NE S'EXÉCUTE PAS sur abandon — le code de `api.chat.ts` le dit
 * lui-même à l'endroit où il gère l'erreur — et c'est `onFinish` qui contient
 * les TROIS seuls appels à `flushUsage`. Un tour arrêté par l'utilisateur, ou
 * dont le client se déconnecte, n'était donc jamais porté au registre : ni
 * coût visible pour l'exploitant, ni quota décompté pour le projet.
 *
 * C'EST LA TROISIÈME OCCURRENCE DU MÊME MÉCANISME, et les deux premières sont
 * consignées dans le commentaire de `flushUsage` : « Earlier this only fired on
 * the non-'length' path, so tokens burned on a capped or empty generation were
 * never billed (quota leak). » La règle était donc déjà connue — « toute sortie
 * terminale facture » — mais la sortie par abandon n'y avait pas été rattachée.
 *
 * CE QUI EST RÉELLEMENT CONNU À CET INSTANT, et c'est moins que tout : les
 * jetons du résumé et de la sélection de contexte sont déjà accumulés (leurs
 * `onFinish` à eux se sont exécutés avant la génération principale), et le
 * fournisseur les a bel et bien facturés. Ceux de la génération interrompue,
 * eux, ne nous sont pas rendus par le SDK sur le chemin d'erreur. On enregistre
 * donc ce qu'on sait, sous un motif distinct — jamais on ne devine le reste.
 * Enregistrer moins que la réalité vaut mieux qu'enregistrer zéro.
 *
 * La décision est une FONCTION PURE, à l'image de `doitArreterLePreview` et de
 * `previewServerLooksRunning` : la route est trop grosse pour qu'un test la
 * monte, et une règle qu'on ne peut pas éprouver seule finit par n'être tenue
 * par rien.
 */

export type MotifDeNonFacturation = 'deja-facture' | 'hors-projet' | 'aucun-jeton' | 'panne-avant-generation';

export interface EntreeFacturationAbandon {
  /** Vrai si `flushUsage` a déjà porté ce tour au registre. */
  dejaFacture: boolean;

  /** Le registre est par projet : hors projet, il n'y a rien à débiter. */
  projectId?: string;

  /** Ce que l'accumulateur du tour porte au moment de l'abandon. */
  usage: { promptTokens?: number; completionTokens?: number; totalTokens?: number };

  /**
   * Vrai quand le flux s'arrête parce que le CLIENT est parti ou a appuyé sur
   * Arrêter. Faux pour une panne fournisseur avant toute génération : là, aucun
   * jeton n'a été produit par nous et le fournisseur ne facture rien.
   */
  abandonneParLeClient: boolean;
}

/**
 * Union DISCRIMINÉE, et ce n'est pas cosmétique : elle porte dans le TYPE la
 * garantie que la décision établit — quand on facture, le projet existe. Sans
 * elle, l'appelant devait re-tester `projectId`, et une garde qu'on doit répéter
 * finit par être oubliée à un endroit.
 */
export type DecisionFacturationAbandon =
  | { facturer: true; projectId: string; finishReason: 'aborted'; motif?: undefined }
  | { facturer: false; projectId?: undefined; finishReason: 'aborted'; motif: MotifDeNonFacturation };

/** Somme des jetons réellement connus au moment de l'abandon. */
export function jetonsConnus(usage: EntreeFacturationAbandon['usage']): number {
  const prompt = Number(usage?.promptTokens) || 0;
  const completion = Number(usage?.completionTokens) || 0;
  const total = Number(usage?.totalTokens) || 0;

  return Math.max(total, prompt + completion);
}

export function decisionDeFacturationSurAbandon(entree: EntreeFacturationAbandon): DecisionFacturationAbandon {
  const refus = (motif: MotifDeNonFacturation): DecisionFacturationAbandon => ({
    facturer: false,
    motif,
    finishReason: 'aborted',
  });

  /*
   * L'IDEMPOTENCE D'ABORD. `onError` et `onFinish` peuvent s'exécuter tous les
   * deux sur le même tour — la note du compteur de chaîne le dit explicitement.
   * Sans cette garde, le correctif transformerait un défaut de sous-facturation
   * en défaut de DOUBLE facturation, qui est pire : le premier fait perdre de
   * l'argent à l'exploitant, le second en fait perdre à l'utilisateur.
   */
  if (entree.dejaFacture) {
    return refus('deja-facture');
  }

  if (!entree.projectId) {
    return refus('hors-projet');
  }

  if (!entree.abandonneParLeClient) {
    return refus('panne-avant-generation');
  }

  if (jetonsConnus(entree.usage) <= 0) {
    return refus('aucun-jeton');
  }

  return { facturer: true, projectId: entree.projectId, finishReason: 'aborted' };
}
