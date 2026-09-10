import { createDatabaseClient, type DatabaseClient } from '@vibecore/database';

/*
 * BUG-TEST-DB-HANG-001 — jumeau DÉLIBÉRÉ de
 * `services/api/src/tests/base-de-donnees-joignable.ts`.
 *
 * Ce paquet ne partage pas de code de test avec `services/api` ; la duplication
 * est assumée, comme pour `env-url.ts`. Ce qu'elle évite est mesuré : le
 * `await prisma.$disconnect()` d'une sonde dont la connexion a échoué ne se
 * dénoue JAMAIS (chronométré le 2026-09-10 : toujours en cours après 8 s, et
 * 93 minutes constatées sur une exécution réelle). Ici la sonde est appelée au
 * niveau MODULE, donc le gel bloque la collecte du fichier entier — et une
 * suite qui ne collecte plus se lit comme une suite verte (règle 14 bis).
 */

const DELAI_DE_SONDE_MS = 10_000;
const DELAI_DE_FERMETURE_MS = 2_000;

function apres(ms: number): Promise<'delai'> {
  return new Promise((resoudre) => {
    const minuteur = setTimeout(() => resoudre('delai'), ms);
    minuteur.unref?.();
  });
}

async function fermerSansBloquer(prisma: { $disconnect: () => Promise<unknown> }) {
  await Promise.race([prisma.$disconnect().catch(() => undefined), apres(DELAI_DE_FERMETURE_MS)]);
}

/**
 * Rend le client SI la base répond, sinon `undefined` — et referme sans jamais
 * pouvoir bloquer sur le chemin d'échec, qui est celui qui gelait.
 */
export async function clientDeBaseJoignable(): Promise<DatabaseClient | undefined> {
  if (!process.env.DATABASE_URL) {
    return undefined;
  }

  const prisma = createDatabaseClient();

  const sonde = (async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;

      return true;
    } catch {
      return false;
    }
  })();

  if ((await Promise.race([sonde, apres(DELAI_DE_SONDE_MS)])) === true) {
    return prisma;
  }

  await fermerSansBloquer(prisma);

  return undefined;
}
