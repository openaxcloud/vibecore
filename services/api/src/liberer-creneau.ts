/**
 * PUBLIER SANS RENVOYER LE CLIENT GRATUIT FERMER SON AUTRE PROJET.
 *
 * Décision d'Avi du 2026-10-01 : un forfait qui ne permet qu'un espace actif ne
 * doit plus bloquer une publication. On met en veille l'AUTRE espace, et on le dit
 * — « un gratuit bloqué n'achète pas, il part ».
 *
 * Mais arrêter un espace qui a un tour d'agent en cours détruirait le travail de
 * l'utilisateur : c'est le défaut que #642 vient de réparer. D'où les deux temps :
 *
 *   1. l'autre espace est INACTIF (aucun tour, aucun build) → on le met en veille ;
 *   2. il a un tour en cours → on ne l'arrête PAS : on le dit, on attend la fin du
 *      tour avec une borne, puis on le met en veille ; si la borne passe, on rend
 *      la main au client, avec ce qui se passe et ce qu'il peut faire.
 *
 * Et une troisième issue, la plus importante : quand l'état des tours ne peut pas
 * être LU (Redis absent ou en panne), on n'arrête rien. « On ne sait pas » n'est
 * jamais « inactif ».
 *
 * La mise en veille n'efface rien : l'arrêt supprime le pod et garde le volume
 * (`WorkspaceManager.stopWorkspace`, épinglé par manager.spec.ts) ; l'espace se
 * rouvre avec ses fichiers dès que le client y retourne.
 */

export interface EspaceActif {
  workspaceId: string;
  projectId: string;
  nomDuProjet: string;
}

export type IssueDeLiberation =
  | { etat: 'libere'; misEnVeille: EspaceActif[] }
  | { etat: 'occupe'; espaces: EspaceActif[] }
  | { etat: 'inconnu'; raison: 'aucun-autre-espace' | 'tours-illisibles' };

export interface DependancesDeLiberation {
  /** Les espaces actifs de l'organisation, SAUF celui qu'on veut démarrer. */
  autresEspacesActifs(): Promise<EspaceActif[]>;
  /** Tours en cours sur un projet ; `null` = illisible (services/api/src/tours-partages.ts). */
  toursEnCours(projectId: string): Promise<number | null>;
  /** Un build ou une installation tourne dans l'espace (`/busy` de l'agent). */
  agentOccupe(workspaceId: string): Promise<boolean>;
  /**
   * Sous le verrou de l'organisation : revérifie les tours, met les espaces en
   * veille et réserve le créneau du projet à publier. Rend `tour-apparu` si un
   * tour a démarré entre-temps — rien n'est alors arrêté.
   */
  mettreEnVeilleEtReserver(espaces: EspaceActif[]): Promise<'fait' | 'tour-apparu'>;
  /** Ce que le client lit dans le journal de sa publication. */
  annoncer(evenement: { type: 'attente'; espaces: EspaceActif[]; minutes: number } | { type: 'veille'; espace: EspaceActif }): void;
  attenteMaxMs: number;
  intervalleMs?: number;
  maintenant?: () => number;
  dormir?: (ms: number) => Promise<void>;
}

export async function libererUnCreneauPourPublier(deps: DependancesDeLiberation): Promise<IssueDeLiberation> {
  const maintenant = deps.maintenant ?? Date.now;
  const dormir = deps.dormir ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const intervalle = deps.intervalleMs ?? 5_000;
  const autres = await deps.autresEspacesActifs();

  if (autres.length === 0) {
    // Le refus ne vient pas d'un autre espace (dérogation à 0, par exemple) : rien à mettre en veille.
    return { etat: 'inconnu', raison: 'aucun-autre-espace' };
  }

  const debut = maintenant();
  let attenteAnnoncee = false;

  for (;;) {
    const etats = await Promise.all(
      autres.map(async (espace) => {
        const tours = await deps.toursEnCours(espace.projectId);

        // On ne sonde l'agent que si les tours ont pu être lus : sinon on s'arrête là de toute façon.
        const occupe = tours === null ? false : await deps.agentOccupe(espace.workspaceId).catch(() => false);

        return { espace, tours, occupe };
      }),
    );

    if (etats.some((etat) => etat.tours === null)) {
      return { etat: 'inconnu', raison: 'tours-illisibles' };
    }

    const actifs = etats.filter((etat) => (etat.tours ?? 0) > 0 || etat.occupe).map((etat) => etat.espace);

    if (actifs.length === 0 && (await deps.mettreEnVeilleEtReserver(autres)) === 'fait') {
      for (const espace of autres) {
        deps.annoncer({ type: 'veille', espace });
      }

      return { etat: 'libere', misEnVeille: autres };
    }

    const ecoule = maintenant() - debut;

    if (ecoule >= deps.attenteMaxMs) {
      return { etat: 'occupe', espaces: actifs.length > 0 ? actifs : autres };
    }

    if (!attenteAnnoncee && actifs.length > 0) {
      deps.annoncer({ type: 'attente', espaces: actifs, minutes: Math.ceil(deps.attenteMaxMs / 60_000) });
      attenteAnnoncee = true;
    }

    await dormir(Math.min(intervalle, deps.attenteMaxMs - ecoule));
  }
}
