/**
 * Un provisionnement encore `PROVISIONING` est-il PÉRIMÉ ?
 *
 * Module AUTONOME à dessein : il n'importe rien du reste de l'API, ce qui
 * permet de le tester DIRECTEMENT. Une première version de ces tests exerçait
 * une copie de la logique restée dans la route — ils seraient restés verts si
 * la route avait dérivé, vérifié par contre-épreuve. Extraire la décision est
 * le seul moyen que le test porte sur le code réellement exécuté.
 */

/**
 * Au-delà de ce délai, un provisionnement n'est plus considéré comme « en vol ».
 *
 * 30 minutes : très au-dessus d'un provisionnement CNPG nominal — celui
 * déclenché depuis l'interface le 2026-09-01 est passé `ACTIVE` en moins d'une
 * minute — et très en dessous des 30 JOURS pendant lesquels les deux lignes
 * mesurées en production sont restées bloquées. Le seuil sépare franchement les
 * deux cas sans risquer d'interrompre un provisionnement réellement en cours.
 */
export const PROVISIONING_STALE_MS = 30 * 60 * 1000;

/**
 * `true` quand la ligne est un provisionnement abandonné : le réessai doit
 * alors repartir au lieu de répondre `{ created: false }`.
 *
 * Une instance qui n'est PAS en `PROVISIONING` (ACTIVE, SUSPENDED, DELETED)
 * n'est jamais périmée au sens de cette fonction — on ne relance pas un
 * provisionnement qui a abouti, ni un état délibéré.
 */
export function estProvisionnementPerime(
  instance: { status: string; createdAt: Date | string } | undefined,
  maintenantMs: number = Date.now(),
): boolean {
  if (!instance || instance.status !== 'PROVISIONING') {
    return false;
  }

  return maintenantMs - new Date(instance.createdAt).getTime() >= PROVISIONING_STALE_MS;
}
