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

/** Budget global, en octets. Bien sous les ~10 Mo des navigateurs, marge pour les autres clés. */
export const IDE_MEMORY_BUDGET_BYTES = 4 * 1024 * 1024;

/** Plafond par projet : au-delà, une seule entrée pourrait manger tout le budget. */
export const IDE_MEMORY_ENTRY_CAP_BYTES = 1024 * 1024;

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
 * Ramène le stockage sous le budget en évinçant les entrées les moins récemment
 * mises à jour. `keepKey` est toujours épargnée. Renvoie les clés évincées.
 */
export function pruneToBudget(
  storage: BudgetStorage,
  prefix: string,
  options: { budgetBytes?: number; keepKey?: string } = {},
): string[] {
  const budget = options.budgetBytes ?? IDE_MEMORY_BUDGET_BYTES;
  const entrees = listEntries(storage, prefix);

  let total = totalBytes(entrees);

  if (total <= budget) {
    return [];
  }

  /*
   * Les plus anciennes d'abord. À égalité de date — entrées sans `updatedAt` —
   * la plus grosse part en premier : c'est elle qui libère le plus de place pour
   * le moins d'entrées perdues.
   */
  const candidates = entrees
    .filter((entree) => entree.key !== options.keepKey)
    .sort((a, b) => a.updatedAt - b.updatedAt || b.bytes - a.bytes);

  const evincees: string[] = [];

  for (const candidate of candidates) {
    if (total <= budget) {
      break;
    }

    try {
      storage.removeItem(candidate.key);
      total -= candidate.bytes;
      evincees.push(candidate.key);
    } catch {
      // Un retrait refusé ne doit pas interrompre la purge des suivantes.
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
