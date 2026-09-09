import { createDatabaseClient } from '@vibecore/database';
import { describe, expect, it } from 'vitest';

import { PrismaApiStore } from '../prisma-store.js';

/**
 * PANEL-PERF — l'ordre de la liste d'instantanés doit être TOTAL.
 *
 * `listSnapshots` trie par `createdAt desc` PUIS par `id desc`. Le second
 * critère n'est pas cosmétique : les instantanés « before-ai-change » sont pris
 * par tour d'agent, et plusieurs partagent la même seconde. Sans ordre total,
 * PostgreSQL est libre de rendre les ex æquo dans n'importe quel ordre, et la
 * pagination par curseur — qui localise sa position PAR l'ORDER BY — peut alors
 * sauter ou répéter une ligne.
 *
 * ⚠️ POURQUOI CE FICHIER EXISTE. Ce point avait été déclaré comme réserve non
 * couverte : le banc en mémoire (`TestApiStore`) trie lui-même et ne rejoue pas
 * l'ordre de Prisma, donc retirer `{ id: 'desc' }` du magasin Prisma laissait
 * TOUTE la suite au vert. La seule façon honnête de tenir ce point est de le
 * mesurer sur un vrai PostgreSQL.
 *
 * Le test se saute sans `DATABASE_URL` — même garde que `prisma-store.spec.ts`.
 * Vérifié en local sur un PostgreSQL jetable (pgvector/pgvector:pg16,
 * migrations appliquées) : rouge en retirant `{ id: 'desc' }`, vert avec.
 */

async function canReachDatabase() {
  if (!process.env.DATABASE_URL) {
    return false;
  }

  const prisma = createDatabaseClient();

  try {
    await prisma.$queryRaw`SELECT 1`;

    return true;
  } catch {
    return false;
  } finally {
    await prisma.$disconnect();
  }
}

const runPrismaTests = (await canReachDatabase()) ? describe : describe.skip;

const NOMBRE = 8;

runPrismaTests('PANEL-PERF — ordre total de la liste d’instantanés (PostgreSQL réel)', () => {
  it('départage les ex æquo par `id`, et la pagination ne perd ni ne duplique', async () => {
    const prisma = createDatabaseClient();
    const store = new PrismaApiStore(prisma);
    const marque = `tiebreak-${Date.now().toString(36)}`;

    try {
      const org = await prisma.organization.create({ data: { name: marque, slug: marque } });
      const project = await prisma.project.create({
        data: { organizationId: org.id, name: marque, slug: marque },
      });

      /*
       * TOUS au même instant : c'est la condition qui rend le tri secondaire
       * nécessaire, et elle est le cas NORMAL — plusieurs instantanés naissent
       * dans le même tour d'agent.
       */
      const instant = new Date('2026-09-09T00:00:00.000Z');
      await prisma.projectSnapshot.createMany({
        data: Array.from({ length: NOMBRE }, (_, index) => ({
          projectId: project.id,
          label: `point-${index}`,
          kind: 'before-ai-change',
          manifest: { files: [] },
          createdAt: instant,
        })),
      });

      const complet = await store.listSnapshots(project.id);
      expect(complet, 'témoin : les instantanés existent bien').toHaveLength(NOMBRE);
      expect(new Set(complet.map((s) => s.createdAt)).size, 'témoin : ils sont bien ex æquo').toBe(1);

      /* Ordre TOTAL : à `createdAt` égal, les identifiants décroissent strictement. */
      const ids = complet.map((snapshot) => snapshot.id);
      expect(ids, 'les ex æquo sont départagés par id décroissant').toEqual([...ids].sort().reverse());

      /* Et la découpe par curseur reproduit exactement la liste complète. */
      const vus: string[] = [];
      let cursor: string | undefined;
      let pages = 0;

      for (let page = 0; page < NOMBRE + 2; page += 1) {
        const lot = await store.listSnapshots(project.id, { take: 3, ...(cursor ? { cursor } : {}) });

        if (lot.length === 0) {
          break;
        }

        vus.push(...lot.map((snapshot) => snapshot.id));
        cursor = lot[lot.length - 1]?.id;
        pages += 1;
      }

      expect(pages, 'témoin : plusieurs pages ont bien été parcourues').toBeGreaterThan(1);
      expect(vus, 'aucune ligne perdue, dupliquée ni réordonnée').toEqual(ids);
    } finally {
      await prisma.organization.deleteMany({ where: { slug: marque } });
      await prisma.$disconnect();
    }
  });
});
