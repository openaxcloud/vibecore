import { beforeEach, describe, expect, it } from 'vitest';

import { horodatageMessageMonotone, reinitialiserHorodatageMessage } from './horodatage-message.js';
import { PrismaApiStore } from './prisma-store.js';

/*
 * BUG-AGENT-ORDER-001 — les messages d'un fil revenaient dans le DÉSORDRE.
 *
 * `AiMessage.createdAt` est à la milliseconde. Question et réponse d'un même
 * tour, ou une transcription synchronisée en rafale, partagent souvent cette
 * milliseconde — mesuré en local : 3 transcriptions sur 20. `ORDER BY
 * createdAt` ne départage pas les ex æquo : selon le plan (parcours d'index
 * ou tri instable), la réponse précède la question. En CI l'E2E de densité
 * rougissait un run sur deux, sans changement de code, sur des lignes
 * user/assistant permutées.
 *
 * Deux gardes, exécutées : l'horodatage est STRICTEMENT croissant même quand
 * l'horloge ne bouge pas, et le magasin le pose à la création puis départage
 * par `id` à la lecture.
 */

describe('horodatage monotone des messages', () => {
  beforeEach(() => reinitialiserHorodatageMessage());

  it('trois messages dans la même milliseconde reçoivent trois instants strictement croissants', () => {
    const horloge = () => 1_700_000_000_000;
    const instants = [1, 2, 3].map(() => horodatageMessageMonotone(horloge).getTime());

    expect(instants).toEqual([1_700_000_000_000, 1_700_000_000_001, 1_700_000_000_002]);
  });

  it('suit l’horloge quand elle avance, sans jamais reculer', () => {
    let t = 1_700_000_000_000;

    const horloge = () => t;

    const a = horodatageMessageMonotone(horloge).getTime();
    t += 50;

    const b = horodatageMessageMonotone(horloge).getTime();
    t -= 1_000; // une horloge qui recule (NTP) ne fait pas reculer les messages

    const c = horodatageMessageMonotone(horloge).getTime();

    expect(b).toBe(a + 50);
    expect(c).toBe(b + 1);
  });
});

describe('PrismaApiStore — ordre des messages', () => {
  beforeEach(() => reinitialiserHorodatageMessage());

  function magasinFactice() {
    const creations: Array<{ createdAt: Date; content: string }> = [];
    const lectures: unknown[] = [];

    const prisma = {
      aiMessage: {
        create: async ({ data }: { data: any }) => {
          creations.push(data);
          return { id: `m${creations.length}`, createdAt: data.createdAt, ...data };
        },
        upsert: async ({ create }: { create: any }) => {
          creations.push(create);
          return { createdAt: create.createdAt, ...create };
        },
        findMany: async (args: unknown) => {
          lectures.push(args);
          return [];
        },
      },
    };

    return { store: new PrismaApiStore(prisma as any), creations, lectures };
  }

  it('pose un createdAt strictement croissant sur une rafale de créations, avec ou sans id fourni', async () => {
    const { store, creations } = magasinFactice();

    await store.createAiMessage({ conversationId: 'c', role: 'user', content: 'Q1' });
    await store.createAiMessage({ conversationId: 'c', role: 'assistant', content: 'R1' });
    await store.createAiMessage({ id: 'u-2', conversationId: 'c', role: 'user', content: 'Q2' });
    await store.createAiMessage({ id: 'a-2', conversationId: 'c', role: 'assistant', content: 'R2' });

    const instants = creations.map((c) => c.createdAt.getTime());

    expect(creations.map((c) => c.content)).toEqual(['Q1', 'R1', 'Q2', 'R2']);

    for (let i = 1; i < instants.length; i += 1) {
      expect(instants[i], `message ${i} n’est pas strictement après le ${i - 1}`).toBeGreaterThan(instants[i - 1]);
    }
  });

  it('lit dans un ordre déterministe : createdAt puis id', async () => {
    const { store, lectures } = magasinFactice();

    await store.listAiMessages('c');

    expect(lectures[0]).toMatchObject({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
  });
});
