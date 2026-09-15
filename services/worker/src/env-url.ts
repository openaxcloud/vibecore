/*
 * BUG-REDIS-URL-GUILLEMETS-001 — une URL d'environnement CITÉE est jetée en
 * silence, et remplacée par un défaut plausible.
 *
 * MESURÉ le 2026-09-10 avec `ioredis` réel :
 *
 *     new Redis('redis://127.0.0.1:56379')    -> host=127.0.0.1   port=56379
 *     new Redis('"redis://127.0.0.1:56379"')  -> host="localhost" port=6379
 *
 * Ici le défaut mord DEUX FOIS, et la seconde est particulièrement traître :
 * `startWorkers` écrit `process.env.REDIS_URL ?? 'redis://localhost:6379'`. Le
 * `??` ne voit qu'une chaîne non nulle — il garde donc la valeur citée, que
 * `ioredis` jette ensuite pour partir sur `localhost:6379` de son côté. Le
 * repli codé et le repli d'ioredis donnent la même adresse, ce qui rend le
 * défaut parfaitement invisible : le worker semble simplement « en local ».
 *
 * ⚠️ DUPLICATION DÉLIBÉRÉE. Ce module est le jumeau de
 * `services/api/src/env-url.ts`. Les deux paquets ne partagent aujourd'hui que
 * `@vibecore/database` et `@vibecore/security`, dont aucun n'est un toit
 * raisonnable pour de la lecture d'environnement ; ajouter une dépendance
 * inter-paquets pour douze lignes est un risque de construction supérieur au
 * bénéfice. Chaque copie porte SA garde (`env-url.spec.ts`) contre la dérive.
 */

export interface UrlDEnvironnement {
  valeur?: string;
  guillemetsRetires: boolean;
}

const PAIRES = [
  ['"', '"'],
  ["'", "'"],
] as const;

/** Ne retire QUE des guillemets APPARIÉS : un guillemet orphelin n'est pas ce défaut. */
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

const dejaSignalees = new Set<string>();

/**
 * Lit une URL dans l'environnement et la rend utilisable.
 *
 * L'avertissement ne porte que le NOM de la variable : une URL de connexion
 * contient souvent un mot de passe, et un avertissement ne doit pas faire fuir
 * ce qu'il signale (règle 12). Il n'est émis qu'une fois par variable, pour ne
 * pas noyer le journal.
 */
export function lireUrlDEnvironnement(nom: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  const { valeur, guillemetsRetires } = normaliserUrlDEnvironnement(env[nom]);

  if (guillemetsRetires && !dejaSignalees.has(nom)) {
    dejaSignalees.add(nom);
    console.warn(
      `[env] ${nom} was wrapped in quotes; they were stripped. ` +
        'Left as-is, the client would have discarded the configured URL and fallen back to its default host and port. ' +
        'Fix the value at its source (configmap, secret, or .env) — the quotes are not part of the URL.',
    );
  }

  return valeur;
}

/** Test hook: oublie ce qui a déjà été signalé. */
export function reinitialiserAvertissementsUrlCitee() {
  dejaSignalees.clear();
}
