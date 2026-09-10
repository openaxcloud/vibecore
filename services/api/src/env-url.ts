/*
 * BUG-REDIS-URL-GUILLEMETS-001 — une URL d'environnement CITÉE est jetée en
 * silence, et remplacée par un défaut plausible.
 *
 * MESURÉ le 2026-09-10 dans ce bac à sable, avec `ioredis` réel :
 *
 *     new Redis('redis://127.0.0.1:56379')    -> host=127.0.0.1   port=56379
 *     new Redis('"redis://127.0.0.1:56379"')  -> host="localhost" port=6379
 *
 * Ce n'est PAS un échec de connexion : c'est un remplacement. L'URL configurée
 * disparaît, le port avec elle, et le client part sur `localhost:6379` — une
 * valeur si banale qu'un exploitant qui la lit dans les journaux conclut que la
 * variable n'est pas posée. Elle l'est. Elle est simplement ignorée.
 *
 * D'où viennent ces guillemets : d'une valeur écrite `REDIS_URL="redis://…"`
 * dans un fichier d'environnement ou un configmap, puis passée VERBATIM au
 * processus. Les chargeurs de `.env` les retirent ; une variable posée par
 * l'orchestrateur, non. Vérifié ici : `REDIS_URL` fait 65 caractères et
 * commence ET finit par un guillemet.
 *
 * CE QUE CE MODULE FAIT, ET POURQUOI DANS CET ORDRE :
 *   1. il RETIRE la paire de guillemets, pour que la plateforme fonctionne ;
 *   2. il le SIGNALE, pour que la configuration soit corrigée à la source.
 *
 * Réparer sans le dire remplacerait un défaut silencieux par un autre.
 */

/** Ce qu'une lecture d'URL d'environnement a produit, et ce qu'il a fallu réparer. */
export interface UrlDEnvironnement {
  /** La valeur utilisable, ou `undefined` quand la variable est absente ou vide. */
  valeur?: string;

  /** Vrai quand une paire de guillemets encadrait la valeur et a été retirée. */
  guillemetsRetires: boolean;
}

const PAIRES = [
  ['"', '"'],
  ["'", "'"],
] as const;

/**
 * Normalise une URL lue dans l'environnement.
 *
 * Ne retire QUE des guillemets APPARIÉS en tête et en queue : une valeur qui
 * n'en porte qu'un seul est laissée telle quelle, parce qu'elle n'est pas le
 * défaut qu'on corrige et qu'on ne devine pas l'intention.
 */
export function normaliserUrlDEnvironnement(brut: string | undefined | null): UrlDEnvironnement {
  const coupe = (brut ?? '').trim();

  if (coupe === '') {
    return { guillemetsRetires: false };
  }

  for (const [ouvrant, fermant] of PAIRES) {
    if (coupe.length >= 2 && coupe.startsWith(ouvrant) && coupe.endsWith(fermant)) {
      const interieur = coupe.slice(1, -1).trim();

      return interieur === '' ? { guillemetsRetires: true } : { valeur: interieur, guillemetsRetires: true };
    }
  }

  return { valeur: coupe, guillemetsRetires: false };
}

/**
 * Lit une URL dans l'environnement et la rend utilisable.
 *
 * `onAvertissement` reçoit le NOM de la variable, jamais sa valeur : une URL de
 * connexion porte souvent un mot de passe, et un avertissement ne doit pas
 * faire fuir ce qu'il signale (règle 12).
 */
export function lireUrlDEnvironnement(
  nom: string,
  env: NodeJS.ProcessEnv = process.env,
  onAvertissement?: (nom: string) => void,
): string | undefined {
  const { valeur, guillemetsRetires } = normaliserUrlDEnvironnement(env[nom]);

  if (guillemetsRetires) {
    onAvertissement?.(nom);
  }

  return valeur;
}
