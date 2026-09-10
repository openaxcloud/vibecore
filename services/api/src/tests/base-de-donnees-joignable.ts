import { createDatabaseClient } from '@vibecore/database';

/*
 * BUG-TEST-DB-HANG-001 — la suite `services/api` se FIGE indéfiniment quand la
 * base n'est pas joignable, au lieu de sauter ses tests d'intégration.
 *
 * MESURÉ le 2026-09-10 (règle 11 — dépôt /home/user/vibecore, branche
 * claude/input-zone-spacing-font-n1rxx3, aucune base en écoute dans le
 * conteneur), en chronométrant chaque étape de la sonde :
 *
 *   createDatabaseClient → 78 ms
 *   $queryRaw LÈVE       → 197 ms   (PrismaClientKnownRequestError)
 *   $disconnect()        → TOUJOURS EN COURS après 8 s
 *
 * La levée est bien attrapée ; c'est le `await prisma.$disconnect()` du `finally`
 * qui ne se dénoue JAMAIS quand le client n'a jamais réussi à se connecter. Comme
 * il est dans le `finally` de la sonde, la sonde ne rend jamais, le `beforeAll`
 * ne finit jamais, et le fichier reste en l'air. Le `hookTimeout: 120_000` de
 * `vitest.config.ts` ne le sauve pas : le moteur bloque en code natif, hors de
 * portée du minuteur.
 *
 * Constaté DEUX FOIS sur deux exécutions, dont une laissée 93 minutes.
 * Règle 17 : ce n'est donc pas une course, c'est un comportement déterministe.
 *
 * ⚠️ La panne est SILENCIEUSE dans les deux sens (règle 14 bis) : le fichier qui
 * se fige n'imprime aucun échec, et les autres fichiers adossés à la base
 * SAUTENT sans bruit. Une suite qui ne mesure plus rien se lit exactement comme
 * une suite verte.
 *
 * Ce module est le point de passage unique des huit sondes qui existaient en
 * copies indépendantes (six dans services/api, plus workspace-manager et
 * ai-gateway) — règle 7 : trois symptômes du même mécanisme se corrigent une
 * fois.
 */

/**
 * Budget total de la sonde. Généreux pour une base réellement présente (une
 * poignée de millisecondes en local), et court au regard d'une suite qui
 * autrement se fige sans fin.
 */
export const DELAI_DE_SONDE_MS = 10_000;

/** Budget de la FERMETURE, qui est la partie qui bloquait. */
export const DELAI_DE_FERMETURE_MS = 2_000;

function apres(ms: number): Promise<'delai'> {
  return new Promise((resoudre) => {
    const minuteur = setTimeout(() => resoudre('delai'), ms);

    /*
     * `unref` pour qu'un minuteur en attente n'empêche jamais le processus de
     * se terminer — sinon on remplacerait un gel par une sortie qui traîne.
     */
    minuteur.unref?.();
  });
}

/**
 * Ferme le client sans jamais pouvoir bloquer.
 *
 * On n'ABANDONNE pas la promesse de `$disconnect()` : on cesse simplement de
 * l'attendre. C'est exactement ce qu'il faut ici — la fermeture d'un client qui
 * n'a jamais été connecté n'a rien à libérer.
 */
export async function fermerSansBloquer(prisma: { $disconnect: () => Promise<unknown> }) {
  await Promise.race([prisma.$disconnect().catch(() => undefined), apres(DELAI_DE_FERMETURE_MS)]);
}

/**
 * La base est-elle réellement joignable ?
 *
 * Rend `false` — jamais une promesse en suspens — quand `DATABASE_URL` est
 * absente, illisible, ou pointe vers un hôte qui n'écoute pas.
 */
export async function baseDeDonneesJoignable(): Promise<boolean> {
  if (!process.env.DATABASE_URL) {
    return false;
  }

  const prisma = createDatabaseClient();

  /*
   * La REQUÊTE aussi est bornée, pas seulement la fermeture : une URL dont
   * l'hôte résout mais n'accepte pas de connexion fait attendre `$queryRaw`
   * sans limite (mesuré : un `pg.Client` avec `connectionTimeoutMillis: 4000`
   * n'a jamais rendu la main sur cette même URL). Borner la seule fermeture
   * aurait déplacé le gel d'une ligne.
   */
  const sonde = (async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;

      return true;
    } catch {
      return false;
    }
  })();

  const issue = await Promise.race([sonde, apres(DELAI_DE_SONDE_MS)]);

  await fermerSansBloquer(prisma);

  return issue === true;
}
