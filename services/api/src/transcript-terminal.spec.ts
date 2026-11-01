import { appPublicEnglish } from './app-public-copy.js';
import { describe, expect, it } from 'vitest';
import {
  bindTranscriptTerminal,
  readTranscriptTerminal,
  transcriptContentHash,
  transcriptTerminalSchema,
} from './transcript-terminal.js';

const fixture = () => ({
  type: 'streamTerminal' as const,
  status: 'complete' as const,
  finishReason: 'stop' as const,
  reason: 'finished' as const,
  segments: 1,
  fileActions: 0,
  openActions: 0,
  openArtifacts: 0,
  contentSha256: transcriptContentHash('Synthetic'),
});
describe('terminal receipt is a bounded observed-text claim', () => {
  it('strips arbitrary payload and rejects missing binding or inconsistent completion', () => {
    expect(transcriptTerminalSchema.parse({ ...fixture(), secretPayload: 'synthetic' })).toEqual(fixture());
    expect(transcriptTerminalSchema.safeParse({ ...fixture(), contentSha256: undefined }).success).toBe(false);
    expect(transcriptTerminalSchema.safeParse({ ...fixture(), openActions: 1 }).success).toBe(false);
    expect(transcriptTerminalSchema.safeParse({ ...fixture(), finishReason: 'length' }).success).toBe(false);
    expect(transcriptTerminalSchema.safeParse({ ...fixture(), segments: -1 }).success).toBe(false);
  });
  it('rejects reused observed receipts on edited content and tampered persisted bindings', () => {
    const bound = bindTranscriptTerminal('Synthetic', fixture(), 'id-a');
    expect(readTranscriptTerminal('Synthetic', bound, 'id-a')).toMatchObject({ status: 'complete', messageId: 'id-a' });
    expect(() => bindTranscriptTerminal('Edited', fixture(), 'id-a')).toThrow(appPublicEnglish('TRANSCRIPT_RECEIPT_CONTENT_MISMATCH'));
    expect(readTranscriptTerminal('Edited', bound, 'id-a')).toBeUndefined();
    expect(readTranscriptTerminal('Synthetic', bound, 'id-b')).toBeUndefined();
    expect(
      readTranscriptTerminal(
        'Synthetic',
        { ...bound, receipt: { ...bound.receipt, contentSha256: '0'.repeat(64) } },
        'id-a',
      ),
    ).toBeUndefined();
    expect(readTranscriptTerminal('Synthetic', null, 'id-a')).toBeUndefined();
  });
});
