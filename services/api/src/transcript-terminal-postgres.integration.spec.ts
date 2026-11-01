import { randomUUID } from 'node:crypto';
import { createDatabaseClient, type DatabaseClient } from '@vibecore/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaApiStore } from './prisma-store.js';
import { readTranscriptTerminal, transcriptContentHash, type TranscriptTerminal } from './transcript-terminal.js';

describe.skipIf(process.env.TERMINAL_RECEIPT_POSTGRES_PROOF !== '1')('terminal receipts on isolated PostgreSQL', () => {
  let first: PrismaApiStore;
  let second: PrismaApiStore;
  let userId: string;
  let conversationId: string;

  const receipt: TranscriptTerminal = {
    type: 'streamTerminal',
    contentSha256: transcriptContentHash('Synthetic complete response'),
    status: 'complete',
    finishReason: 'stop',
    reason: 'finished',
    segments: 1,
    fileActions: 0,
    openActions: 0,
    openArtifacts: 0,
  };
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    expect(['localhost', '127.0.0.1']).toContain(url.hostname);
    expect(url.pathname).toBe('/terminal_receipt_proof');
    expect(process.env.NODE_ENV).toBe('test');
    first = new PrismaApiStore(createDatabaseClient({ poolMax: 1 }));
    second = new PrismaApiStore(createDatabaseClient({ poolMax: 1 }));

    const user = await first.prisma.user.create({ data: { email: `terminal-${randomUUID()}@example.test` } });
    userId = user.id;
    conversationId = (await first.prisma.aiConversation.create({ data: { userId } })).id;
  });
  afterAll(async () => {
    if (userId) {
      await first.prisma.user.delete({ where: { id: userId } });
    }

    await first?.prisma.$disconnect();
    await second?.prisma.$disconnect();
  });
  it('persists the additive JSONB receipt and binds it across thought normalization and stale writes', async () => {
    const id = `proof-${randomUUID()}`;
    const input = { id, conversationId, role: 'assistant' as const, content: 'Synthetic complete response' };
    await first.syncAiTranscriptMessage({ ...input, terminalReceipt: receipt });
    await second.syncAiTranscriptMessage({
      ...input,
      content: '<div class="__boltThought__">synthetic reasoning</div>\n' + input.content,
    });

    const stale = await second.syncAiTranscriptMessage({ ...input, content: 'Synthetic' });
    expect(stale.stale).toBe(true);
    expect(readTranscriptTerminal(stale.message.content, stale.message.terminalReceipt, id)?.status).toBe('complete');

    const changed = await first.syncAiTranscriptMessage({ ...input, content: 'Replacement answer' });
    expect(changed.message.terminalReceipt).toBeUndefined();

    const columns = await first.prisma.$queryRaw<
      Array<{ data_type: string }>
    >`SELECT data_type FROM information_schema.columns WHERE table_name = 'AiMessage' AND column_name = 'terminalReceipt'`;
    expect(columns).toEqual([{ data_type: 'jsonb' }]);
  });
  it('keeps ordinary conflicts explicit and reconciles only safe terminal snapshots without shortening the winner', async () => {
    const id = `proof-${randomUUID()}`;
    const input = { id, conversationId, role: 'assistant' as const, content: 'Synthetic response' };

    const inserted = await Promise.allSettled([
      first.syncAiTranscriptMessage(input),
      second.syncAiTranscriptMessage(input),
    ]);
    expect(inserted.some((result) => result.status === 'fulfilled')).toBe(true);

    const requests = Array.from({ length: 12 }, (_, index) =>
      (index % 2 ? first : second).syncAiTranscriptMessage({
        ...input,
        content: input.content + ' '.repeat(index + 1),
      }),
    );

    const updated = await Promise.allSettled(requests);
    const failures = [...inserted, ...updated].filter((result) => result.status === 'rejected');
    expect(failures.length).toBeGreaterThan(0);

    for (const failure of failures) {
      if (failure.status === 'rejected') {
        expect(failure.reason).toMatchObject({ statusCode: 409, code: 'TRANSCRIPT_CONFLICT' });
      }
    }
    expect(await first.prisma.aiMessage.count({ where: { id } })).toBe(1);

    const winnerBeforeFinal = await first.prisma.aiMessage.findUniqueOrThrow({ where: { id } });
    const final = await first.syncAiTranscriptMessage({
      ...input,
      content: winnerBeforeFinal.content + ' final',
      terminalReceipt: { ...receipt, contentSha256: transcriptContentHash(winnerBeforeFinal.content + ' final') },
    });

    const stale = await second.syncAiTranscriptMessage(input);
    expect(stale.stale).toBe(true);
    expect(stale.message.content).toBe(final.message.content);
    expect(readTranscriptTerminal(stale.message.content, stale.message.terminalReceipt, id)?.status).toBe('complete');
    // Pause only after a real SQL read: the final receipt itself loses the first transaction.
    for (const winner of ['same', 'prefix', 'divergent', 'longer', 'different-receipt', 'thought', 'insert'] as const) {
      const contestedId = `proof-${randomUUID()}`;
      const finalContent = 'Synthetic response final';
      const base = { id: contestedId, conversationId, role: 'assistant' as const };
      if (winner !== 'insert') await first.syncAiTranscriptMessage({ ...base, content: 'Synthetic' });
      let sawRead!: () => void;
      let releaseRead!: () => void;
      const observed = new Promise<void>((resolve) => {
        sawRead = resolve;
      });
      const released = new Promise<void>((resolve) => {
        releaseRead = resolve;
      });
      let paused = false;
      const client = createDatabaseClient({ poolMax: 1 });
      const gated = client.$extends({
        query: {
          aiMessage: {
            async findUnique({ args, query }) {
              const row = await query(args);
              if (!paused && args.where.id === contestedId) {
                paused = true;
                sawRead();
                await released;
              }
              return row;
            },
          },
        },
      });
      const contender = new PrismaApiStore(gated as unknown as DatabaseClient);
      const attempt = contender.syncAiTranscriptMessage({
        ...base,
        content: finalContent,
        terminalReceipt: { ...receipt, contentSha256: transcriptContentHash(finalContent) },
      });
      // Attach rejection handling immediately while the SQL transaction waits.
      const settled = attempt.then(
        (value) => ({ value }),
        (error) => ({ error }),
      );
      try {
        await observed;
        const winnerContent =
          winner === 'prefix'
            ? 'Synthetic response'
            : winner === 'divergent'
              ? 'Concurrent user edit'
              : winner === 'longer'
                ? finalContent + ' concurrent extension'
                : winner === 'thought'
                  ? '<div class="__boltThought__">Synthetic thought</div>\n' + finalContent
                  : finalContent;
        await second.syncAiTranscriptMessage({
          ...base,
          content: winnerContent,
          ...(winner === 'different-receipt'
            ? {
                terminalReceipt: {
                  ...receipt,
                  contentSha256: transcriptContentHash(finalContent),
                  status: 'incomplete' as const,
                  finishReason: 'length' as const,
                  reason: 'output-limit' as const,
                },
              }
            : {}),
        });
        releaseRead();
        const result = await settled;
        const row = await first.prisma.aiMessage.findUniqueOrThrow({ where: { id: contestedId } });
        if (winner === 'divergent' || winner === 'different-receipt') {
          expect(result).toMatchObject({ error: { statusCode: 409, code: 'TRANSCRIPT_CONFLICT' } });
          expect(row.content).toBe(winnerContent);
          if (winner === 'divergent') expect(row.terminalReceipt).toBeNull();
          else expect(readTranscriptTerminal(row.content, row.terminalReceipt, contestedId)?.status).toBe('incomplete');
        } else if (winner === 'longer') {
          expect(result).toMatchObject({ value: { stale: true } });
          expect(row.content).toBe(winnerContent);
          expect(row.terminalReceipt).toBeNull();
        } else {
          expect(result).toHaveProperty('value');
          expect(row.content).toBe(winner === 'thought' ? winnerContent : finalContent);
          expect(readTranscriptTerminal(row.content, row.terminalReceipt, contestedId)?.status).toBe('complete');
        }
      } finally {
        releaseRead();
        await settled;
        await client.$disconnect();
      }
    }
    process.stdout.write(
      `TERMINAL_RECEIPT_POSTGRES ${JSON.stringify({ conflicts: failures.length, oneRow: true, stalePreserved: true, terminalContendedCases: 7 })}\n`,
    );
  });
});
