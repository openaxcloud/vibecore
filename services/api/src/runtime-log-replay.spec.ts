import { describe, expect, it } from 'vitest';
import { RuntimeLogReplay, runtimeLogEvents } from './runtime-log-replay.js';

const received = '2026-10-27T15:02:54.740Z';
const stamp = '2026-10-27T14:00:00.123456789Z';
const events = (lines: string[]) => runtimeLogEvents('workspace-a', lines, received);

describe('runtime source logs and replay', () => {
  it('keeps nanosecond source timestamps, separate from receipt time', () => {
    expect(events([`${stamp} preview.proxy.unreachable fetch failed`])[0]).toMatchObject({
      timestamp: stamp,
      receivedAt: received,
      timestampSource: 'source',
      data: 'preview.proxy.unreachable fetch failed',
    });
  });

  it('reconnects with stable IDs without making old failures recent', () => {
    const lines = Array.from({ length: 36 }, (_, index) => `${stamp} retained-${index}`);
    expect(
      runtimeLogEvents('workspace-a', lines, received).map(({ eventId, timestamp }) => ({ eventId, timestamp })),
    ).toEqual(
      runtimeLogEvents('workspace-a', lines, '2026-10-28T01:00:00Z').map(({ eventId, timestamp }) => ({
        eventId,
        timestamp,
      })),
    );
  });

  it('does not deduplicate equal text from distinct times, occurrences or workspaces', () => {
    const repeated = events([`${stamp} same`, `${stamp} same`, '2026-10-27T14:00:01Z same']);
    expect(new Set(repeated.map((event) => event.eventId)).size).toBe(3);
    expect(repeated[0].eventId).not.toBe(runtimeLogEvents('workspace-b', [`${stamp} same`], received)[0].eventId);
  });

  it('does not invent an occurrence time or stable ID for legacy or malformed data', () => {
    for (const event of events(['old failure', '2026-99-99T99:99:99Z bad'])) {
      expect(event.timestamp).toBe('');
      expect(event.timestampSource).toBe('unknown');
      expect(event.eventId).toBeUndefined();
      expect(event.receivedAt).toBe(received);
    }
  });

  it('detects new events when the 500-line window slides without changing size', () => {
    const replay = new RuntimeLogReplay();
    const lines = Array.from({ length: 501 }, (_, index) => `${stamp} line-${index}`);
    expect(replay.accept(events(lines.slice(0, 500)))).toHaveLength(500);
    expect(replay.accept(events(lines.slice(1)))).toEqual([events([lines[500]])[0]]);
    expect(replay.accept(events(lines.slice(1)))).toEqual([]);
    expect(replay.accept(events([`${stamp} new-after-rotation`]))).toHaveLength(1);
  });

  it('bounds source replay memory and never deduplicates legacy lines by text', () => {
    const replay = new RuntimeLogReplay();

    for (let index = 0; index < 2001; index++) {
      replay.accept(events([`${stamp} line-${index}`]));
    }
    expect(replay.accept(events([`${stamp} line-0`]))).toHaveLength(1);
    expect(replay.accept(events(['same', 'same']))).toHaveLength(2);
    expect(replay.accept(events(['same', 'same']))).toHaveLength(0);
  });
});
