import { atom } from 'nanostores';

/**
 * LES FICHIERS QUE L'AGENT A PRODUITS MAIS QUE LE WORKSPACE N'A PAS PU RECEVOIR.
 *
 * BUG-QA0928-RUNTIME-ID-PROJET — mesuré en production le 2026-09-28 : 78
 * écritures de fichiers refusées en une minute, et l'utilisateur n'en savait
 * rien. Le démarrage du workspace avait été refusé (quota `workspaces.active`,
 * un autre projet ouvert) ; le contenu généré n'existait plus que dans le
 * message de l'assistant.
 *
 * Ce module garde chaque écriture refusée FAUTE DE WORKSPACE, par projet et par
 * chemin (la dernière version gagne), et la rejoue au prochain démarrage réussi.
 *
 * Pourquoi `localStorage` et pas la mémoire : le bouton « Redémarrer l'espace de
 * travail » RECHARGE LA PAGE (`restartWorkspace` → `window.location.reload()`).
 * Une file en mémoire disparaîtrait au moment précis où l'utilisateur fait ce
 * qu'on lui demande. Le stockage peut manquer (navigation privée, quota) : on
 * le dit alors franchement au lieu de promettre un rejeu qu'on ne tiendra pas.
 *
 * Ne garde QUE les refus « pas de workspace » (`WORKSPACE_NOT_STARTED`) : une
 * erreur de contenu (JSON invalide, chemin refusé) rejouée échouerait pareil.
 */

export interface EcritureEnAttente {
  chemin: string;
  contenu: string;
  enregistreeLe: number;
}

export interface EtatDesEcrituresEnAttente {
  projectId?: string;
  ecritures: readonly EcritureEnAttente[];

  /** Faux quand le navigateur a refusé d'en garder une copie durable. */
  conservees: boolean;
}

export interface Rangement {
  lire(cle: string): string | null;
  ecrire(cle: string, valeur: string): void;
  effacer(cle: string): void;
}

/** Au-delà, on ne promet pas la durabilité : `localStorage` plafonne vers 5 Mo par origine. */
export const TAILLE_MAX_CONSERVEE = 3_000_000;

const PREFIXE = 'vibecore:ecritures-en-attente:';

export const ecrituresEnAttenteStore = atom<EtatDesEcrituresEnAttente>({ ecritures: [], conservees: true });

/*
 * Le démarrage du workspace a été refusé pour un QUOTA (en pratique
 * `workspaces.active` : le forfait gratuit n'en permet qu'un, et un autre projet
 * est ouvert). Tant que c'est vrai, l'agent ne pourra écrire aucun fichier :
 * l'utilisateur doit le savoir AVANT d'envoyer sa demande, pas après.
 */
export const demarrageRefusePourQuotaStore = atom<boolean>(false);

let projetCourant: string | undefined;

const rangementNavigateur: Rangement = {
  lire: (cle) => window.localStorage.getItem(cle),
  ecrire: (cle, valeur) => window.localStorage.setItem(cle, valeur),
  effacer: (cle) => window.localStorage.removeItem(cle),
};

function rangementParDefaut(): Rangement | undefined {
  try {
    return typeof window !== 'undefined' && window.localStorage ? rangementNavigateur : undefined;
  } catch {
    return undefined;
  }
}

/** Vrai quand l'écriture a été refusée parce qu'aucun workspace n'a démarré. */
export function estRefusFauteDeWorkspace(error: unknown): boolean {
  return (error as { code?: unknown } | undefined)?.code === 'WORKSPACE_NOT_STARTED';
}

function lireFile(projectId: string, rangement: Rangement | undefined): EcritureEnAttente[] {
  if (!rangement) {
    return [];
  }

  try {
    const brut = rangement.lire(PREFIXE + projectId);
    const valeur = brut ? (JSON.parse(brut) as unknown) : [];

    return Array.isArray(valeur)
      ? valeur.filter(
          (entree): entree is EcritureEnAttente =>
            typeof entree?.chemin === 'string' && typeof entree?.contenu === 'string',
        )
      : [];
  } catch {
    return [];
  }
}

function publier(projectId: string, ecritures: EcritureEnAttente[], conservees: boolean): void {
  ecrituresEnAttenteStore.set({ projectId, ecritures, conservees });
}

function ranger(projectId: string, ecritures: EcritureEnAttente[], rangement: Rangement | undefined): boolean {
  if (!rangement) {
    return false;
  }

  try {
    if (ecritures.length === 0) {
      rangement.effacer(PREFIXE + projectId);
      return true;
    }

    const serialise = JSON.stringify(ecritures);

    if (serialise.length > TAILLE_MAX_CONSERVEE) {
      rangement.effacer(PREFIXE + projectId);
      return false;
    }

    rangement.ecrire(PREFIXE + projectId, serialise);

    return true;
  } catch {
    return false;
  }
}

/**
 * Le projet affiché. Recharge ce qui avait été gardé pour lui — c'est ce qui
 * rend la file visible après le rechargement de « Redémarrer ».
 */
export function definirProjetCourant(projectId: string | undefined, rangement = rangementParDefaut()): void {
  projetCourant = projectId;

  if (!projectId) {
    ecrituresEnAttenteStore.set({ ecritures: [], conservees: true });
    return;
  }

  publier(projectId, lireFile(projectId, rangement), true);
}

/** Garder une écriture refusée faute de workspace. La dernière version d'un chemin gagne. */
export function retenirEcriture(
  chemin: string,
  contenu: string,
  rangement = rangementParDefaut(),
  maintenant = Date.now(),
) {
  const projectId = projetCourant;

  if (!projectId) {
    return;
  }

  const etat = ecrituresEnAttenteStore.get();
  const actuelles = etat.projectId === projectId ? [...etat.ecritures] : lireFile(projectId, rangement);
  const suivantes = actuelles.filter((entree) => entree.chemin !== chemin);
  suivantes.push({ chemin, contenu, enregistreeLe: maintenant });

  publier(projectId, suivantes, ranger(projectId, suivantes, rangement));
}

/**
 * Écrire ce qui attendait, dans l'ordre d'enregistrement. Une écriture réussie
 * quitte la file ; un échec y reste, pour le démarrage suivant.
 */
export async function rejouerEcritures(
  projectId: string,
  ecrire: (chemin: string, contenu: string) => Promise<void>,
  rangement = rangementParDefaut(),
): Promise<{ ecrites: string[]; restantes: string[] }> {
  const etat = ecrituresEnAttenteStore.get();
  const file = etat.projectId === projectId ? [...etat.ecritures] : lireFile(projectId, rangement);
  const ecrites: string[] = [];
  const restantes: EcritureEnAttente[] = [];

  for (const entree of [...file].sort((a, b) => a.enregistreeLe - b.enregistreeLe)) {
    try {
      await ecrire(entree.chemin, entree.contenu);
      ecrites.push(entree.chemin);
    } catch {
      restantes.push(entree);
    }
  }

  publier(projectId, restantes, ranger(projectId, restantes, rangement));

  return { ecrites, restantes: restantes.map((entree) => entree.chemin) };
}

/**
 * Le rejeu tel que le fait le fournisseur de workspace : créer le dossier, puis
 * écrire. Extrait pour être testé sans monter l'IDE — l'écriture distante ne
 * crée pas les dossiers parents, l'agent les crée toujours avant d'écrire.
 */
export function rejouerDansLeWorkspace(
  projectId: string,
  runtime: {
    createDirectory(chemin: string): Promise<void>;
    writeFile(chemin: string, contenu: string): Promise<void>;
  },
  rangement = rangementParDefaut(),
): Promise<{ ecrites: string[]; restantes: string[] }> {
  return rejouerEcritures(
    projectId,
    async (chemin, contenu) => {
      const dossier = chemin.includes('/') ? chemin.slice(0, chemin.lastIndexOf('/')) : '';

      if (dossier) {
        await runtime.createDirectory(dossier);
      }

      await runtime.writeFile(chemin, contenu);
    },
    rangement,
  );
}
