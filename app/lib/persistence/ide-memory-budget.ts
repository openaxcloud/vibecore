/**
 * Budget de stockage de la mémoire IDE : plafond, éviction LRU, purge au démarrage.
 *
 * La mémoire IDE était persistée sans AUCUNE limite ni purge : une entrée
 * `vibecore.projectIdeMemory:<scope>` par projet, gardée pour toujours. Relevé
 * en production sur le navigateur d'un utilisateur : **64 entrées, 10 Mo au
 * total** — la limite du navigateur — dont une de 3,1 Mo. À saturation, la
 * moindre écriture lève `QuotaExceededError`, l'exception remonte dans la boucle
 * de génération et la casse : tâche « En cours » qui grimpe sans fin, aucun
 * fichier écrit, aucune erreur affichée.
 *
 * Trois mécanismes, dans l'ordre où ils protègent :
 *
 *   1. `writeWithinBudget` n'échoue JAMAIS. En cas de refus du stockage, il
 *      évince les autres projets puis retente une fois. Une écriture de mémoire
 *      IDE est un confort ; elle ne doit pas pouvoir interrompre une génération.
 *   2. l'éviction est LRU et ÉPARGNE TOUJOURS le projet courant — évincer ce que
 *      l'utilisateur regarde serait pire que l'erreur qu'on évite.
 *   3. `pruneToBudget` s'exécute au démarrage : sans elle, un navigateur déjà
 *      saturé reste cassé jusqu'à une purge manuelle. C'est exactement ce qu'il
 *      a fallu faire à la main en production.
 */

/**
 * Budget global, en octets.
 *
 * Abaissé de 4 Mo à 2 Mo le 23/08 : relevé live sur le navigateur d'Avi —
 * `localStorage` à ~4,5 Mo, dominé par les entrées de mémoire IDE, et
 * `QuotaExceededError` sur l'écriture d'`eventLogs`. Safari (surtout iOS, où
 * Avi teste) plafonne autour de ~5 Mo par origine : un budget de 4 Mo laissait
 * la mémoire IDE consommer presque tout le quota et faisait échouer les AUTRES
 * clés. 2 Mo laissent une vraie marge quel que soit le navigateur.
 */
export const IDE_MEMORY_BUDGET_BYTES = 2 * 1024 * 1024;

/** Plafond par projet : au-delà, une seule entrée pourrait manger tout le budget. */
export const IDE_MEMORY_ENTRY_CAP_BYTES = 512 * 1024;

/**
 * Nombre maximal de projets gardés en mémoire IDE locale (LRU). Relevé live :
 * une entrée PAR projet jamais ouverte à nouveau, accumulée pour toujours.
 * Au-delà de N projets récents, les plus anciens n'apportent plus rien.
 */
export const IDE_MEMORY_MAX_ENTRIES = 16;

/** Le sous-ensemble de `Storage` réellement utilisé — facilite l'injection en test. */
export interface BudgetStorage {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface StoredEntry {
  key: string;
  bytes: number;

  /** Date de dernière mise à jour, en ms epoch. 0 quand l'entrée n'en porte pas. */
  updatedAt: number;
}

/*
 * Une chaîne JavaScript est stockée en UTF-16 : deux octets par unité de code.
 * Compter les caractères sous-estimerait de moitié, et c'est précisément
 * l'erreur qui fait croire qu'on tient dans le budget juste avant de le dépasser.
 */
function tailleEnOctets(cle: string, valeur: string): number {
  return (cle.length + valeur.length) * 2;
}

function dateDeMiseAJour(valeur: string): number {
  try {
    const analyse = JSON.parse(valeur) as { updatedAt?: unknown };
    const date = typeof analyse?.updatedAt === 'string' ? Date.parse(analyse.updatedAt) : Number.NaN;

    return Number.isFinite(date) ? date : 0;
  } catch {
    return 0;
  }
}

/** Toutes les entrées de mémoire IDE présentes, avec leur taille et leur ancienneté. */
export function listEntries(storage: BudgetStorage, prefix: string): StoredEntry[] {
  const entrees: StoredEntry[] = [];

  for (let index = 0; index < storage.length; index += 1) {
    const cle = storage.key(index);

    if (!cle || !cle.startsWith(`${prefix}:`)) {
      continue;
    }

    const valeur = storage.getItem(cle);

    if (typeof valeur !== 'string') {
      continue;
    }

    entrees.push({ key: cle, bytes: tailleEnOctets(cle, valeur), updatedAt: dateDeMiseAJour(valeur) });
  }

  return entrees;
}

export function totalBytes(entries: readonly StoredEntry[]): number {
  return entries.reduce((somme, entree) => somme + entree.bytes, 0);
}

/**
 * Ramène le stockage sous les trois plafonds — taille par entrée, nombre
 * d'entrées, budget global — en évinçant les entrées les moins récemment mises
 * à jour. `keepKey` est toujours épargnée. Renvoie les clés évincées.
 *
 * Le plafond PAR ENTRÉE est appliqué ici aussi (pas seulement à l'écriture) :
 * relevé live du 23/08 — des entrées de 1,5 Mo et 1,1 Mo, écrites AVANT
 * l'introduction du plafond, survivaient indéfiniment tant que le total restait
 * sous le budget, et maintenaient le stockage au bord du quota.
 */
export function pruneToBudget(
  storage: BudgetStorage,
  prefix: string,
  options: { budgetBytes?: number; keepKey?: string; entryCapBytes?: number; maxEntries?: number } = {},
): string[] {
  const budget = options.budgetBytes ?? IDE_MEMORY_BUDGET_BYTES;
  const entryCap = options.entryCapBytes ?? IDE_MEMORY_ENTRY_CAP_BYTES;
  const maxEntries = options.maxEntries ?? IDE_MEMORY_MAX_ENTRIES;

  let entrees = listEntries(storage, prefix);

  const evincees: string[] = [];

  const evincer = (entree: StoredEntry): boolean => {
    try {
      storage.removeItem(entree.key);
      evincees.push(entree.key);

      return true;
    } catch {
      // Un retrait refusé ne doit pas interrompre la purge des suivantes.
      return false;
    }
  };

  // 1. Entrées hors gabarit — héritées d'avant le plafond d'écriture.
  entrees = entrees.filter((entree) => {
    if (entree.key !== options.keepKey && entree.bytes > entryCap) {
      return !evincer(entree);
    }

    return true;
  });

  /*
   * Les plus anciennes d'abord. À égalité de date — entrées sans `updatedAt` —
   * la plus grosse part en premier : c'est elle qui libère le plus de place pour
   * le moins d'entrées perdues.
   */
  const candidates = entrees
    .filter((entree) => entree.key !== options.keepKey)
    .sort((a, b) => a.updatedAt - b.updatedAt || b.bytes - a.bytes);

  // 2. LRU : au-delà de `maxEntries` projets, les plus anciens n'apportent rien.
  let compte = entrees.length;

  for (const candidate of candidates) {
    if (compte <= maxEntries) {
      break;
    }

    if (evincer(candidate)) {
      compte -= 1;
    }
  }

  // 3. Budget global.
  let total = totalBytes(entrees.filter((entree) => !evincees.includes(entree.key)));

  for (const candidate of candidates) {
    if (total <= budget) {
      break;
    }

    if (evincees.includes(candidate.key)) {
      continue;
    }

    if (evincer(candidate)) {
      total -= candidate.bytes;
    }
  }

  return evincees;
}

export type WriteOutcome = 'written' | 'written-after-evicting' | 'skipped-too-large' | 'failed';

/**
 * Écrit une entrée SANS JAMAIS lever.
 *
 * Une valeur au-delà du plafond par entrée n'est pas écrite du tout : la garder
 * reviendrait à laisser un seul projet consommer le budget de tous les autres,
 * ce qui est la situation qu'on corrige.
 */
export function writeWithinBudget(
  storage: BudgetStorage,
  prefix: string,
  key: string,
  value: string,
  options: { budgetBytes?: number; entryCapBytes?: number } = {},
): WriteOutcome {
  const plafond = options.entryCapBytes ?? IDE_MEMORY_ENTRY_CAP_BYTES;

  if (tailleEnOctets(key, value) > plafond) {
    return 'skipped-too-large';
  }

  try {
    storage.setItem(key, value);
    return 'written';
  } catch {
    /*
     * Refus du stockage : on fait de la place en évinçant les AUTRES projets, puis
     * on retente UNE fois. Pas de boucle — si la seconde tentative échoue encore,
     * le stockage n'est pas le problème et insister ne ferait que retarder la
     * génération que cette fonction est censée protéger.
     */
    pruneToBudget(storage, prefix, { budgetBytes: options.budgetBytes, keepKey: key });

    try {
      storage.setItem(key, value);
      return 'written-after-evicting';
    } catch {
      return 'failed';
    }
  }
}
