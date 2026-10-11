/**
 * LES TOURS DE GÉNÉRATION EN COURS DANS CE PROCESSUS.
 *
 * Mesuré en production le 2026-09-30 à 18:19 : un tour réel démarre sur un pod
 * web, le déploiement suivant remplace ce pod, le navigateur reçoit « network
 * error » à 18:20:28 — et AUCUNE fin de tour n'existe, sur aucun pod. Un pod
 * remplacé a 30 s pour s'arrêter ; un tour en dure 2 à 4 minutes. Dans ce cas ni
 * l'écriture de la réponse par le serveur (#609) ni le rattrapage à la reprise
 * (#622) ne peuvent rien : personne n'a terminé la réponse.
 *
 * Le serveur (`server.mjs`) doit donc attendre ses TOURS avant de s'arrêter — et
 * pas ses connexions : un utilisateur qui a quitté la page a fermé la sienne,
 * alors que son tour continue côté serveur et doit aller au bout.
 *
 * Le registre vit sur `globalThis`, sous un symbole partagé : `server.mjs` et le
 * bundle de l'application sont deux graphes de modules distincts dans le même
 * processus, un simple module ne serait pas le même objet pour les deux.
 */

export const CLE_REGISTRE_DES_TOURS = Symbol.for('vibecore.toursEnCours');

/**
 * Au-delà, un tour est tenu pour terminé même si personne ne l'a fermé : un tour
 * oublié ne doit jamais bloquer un arrêt. La chaîne d'un tour est elle-même bornée
 * à douze minutes (`chat.chaine.delai-depasse`).
 */
export const DUREE_MAX_D_UN_TOUR_MS = 15 * 60_000;

export interface TourEnCours {
  debut: number;
  etiquette: string;
}

export type RegistreDesTours = Map<number, TourEnCours>;

export function registreDesTours(): RegistreDesTours {
  const hote = globalThis as unknown as Record<symbol, RegistreDesTours | undefined>;

  hote[CLE_REGISTRE_DES_TOURS] ??= new Map();

  return hote[CLE_REGISTRE_DES_TOURS];
}

let prochainIdentifiant = 1;

/** Ouvre un tour ; la fonction rendue le ferme (idempotente). */
export function ouvrirUnTour(etiquette: string, registre: RegistreDesTours = registreDesTours()): () => void {
  const id = prochainIdentifiant++;

  registre.set(id, { debut: Date.now(), etiquette });

  return () => {
    registre.delete(id);
  };
}

/** Enveloppe le travail d'un tour : le tour reste ouvert tant que la promesse court. */
export function avecSuiviDuTour<A extends unknown[], R>(
  etiquette: string,
  travail: (...args: A) => Promise<R>,
): (...args: A) => Promise<R> {
  return async (...args: A) => {
    const fermer = ouvrirUnTour(etiquette);

    try {
      return await travail(...args);
    } finally {
      fermer();
    }
  };
}

/** Les tours encore vivants à `maintenant` — un tour plus vieux que la borne est oublié. */
export function toursVivants(registre: RegistreDesTours, maintenant: number): TourEnCours[] {
  for (const [id, tour] of registre) {
    if (maintenant - tour.debut > DUREE_MAX_D_UN_TOUR_MS) {
      registre.delete(id);
    }
  }

  return [...registre.values()];
}

export interface OptionsDAttente {
  /** Borne : au-delà, on s'arrête même si des tours restent (la grâce de Kubernetes est plus longue). */
  maxMs: number;
  intervalleMs?: number;
  journal?: (evenement: Record<string, unknown>) => void;
  registre?: RegistreDesTours;
  maintenant?: () => number;
  dormir?: (ms: number) => Promise<void>;
}

/**
 * Attend que les tours en cours se terminent, avec une borne.
 *
 * Journalise À CHAQUE TOUR ce qu'il a lu (règle 21) : un arrêt qui attend en
 * silence ne se distingue pas d'un arrêt bloqué.
 */
export async function attendreLesTours(options: OptionsDAttente): Promise<{ restants: number; attenteMs: number }> {
  const registre = options.registre ?? registreDesTours();
  const maintenant = options.maintenant ?? Date.now;
  const dormir = options.dormir ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const journal = options.journal ?? ((evenement) => console.log(JSON.stringify(evenement)));
  const intervalle = options.intervalleMs ?? 2_000;
  const debut = maintenant();

  for (;;) {
    const vivants = toursVivants(registre, maintenant());
    const attenteMs = maintenant() - debut;

    journal({
      event: 'arret.attente-des-tours',
      enCours: vivants.length,
      attenteMs,
      etiquettes: vivants.map((t) => t.etiquette),
    });

    if (vivants.length === 0) {
      return { restants: 0, attenteMs };
    }

    if (attenteMs >= options.maxMs) {
      journal({ event: 'arret.borne-atteinte', restants: vivants.length, attenteMs });
      return { restants: vivants.length, attenteMs };
    }

    await dormir(Math.min(intervalle, options.maxMs - attenteMs));
  }
}

/*
 * Exposé au serveur (`server.mjs`), qui n'importe pas ce module : il charge le
 * bundle de l'application, et c'est le chargement du bundle qui enregistre ici la
 * fonction.
 */
export const CLE_ATTENDRE_LES_TOURS = Symbol.for('vibecore.attendreLesTours');

(globalThis as unknown as Record<symbol, unknown>)[CLE_ATTENDRE_LES_TOURS] = attendreLesTours;
