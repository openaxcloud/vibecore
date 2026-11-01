import { randomUUID } from 'node:crypto';
import { createDatabaseClient } from '@vibecore/database';
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
  it('returns explicit conflicts for concurrent inserts and updates without retrying or shortening the winner', async () => {
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

    const final = await first.syncAiTranscriptMessage({
      ...input,
      content: input.content + ' final',
      terminalReceipt: { ...receipt, contentSha256: transcriptContentHash(input.content + ' final') },
    });

    const stale = await second.syncAiTranscriptMessage(input);
    expect(stale.stale).toBe(true);
    expect(stale.message.content).toBe(final.message.content);
    expect(readTranscriptTerminal(stale.message.content, stale.message.terminalReceipt, id)?.status).toBe('complete');
    process.stdout.write(
      `TERMINAL_RECEIPT_POSTGRES ${JSON.stringify({ conflicts: failures.length, oneRow: true, stalePreserved: true })}\n`,
    );
  });
});
