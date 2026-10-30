import { describe, expect, it } from 'vitest';
import { countOpenStreamBlocks, createStreamTerminal, latestStreamTerminal } from './stream-terminal';

const input = {
  finishReason: 'stop',
  content: '<boltArtifact id="x"><boltAction type="file" filePath="x.ts">ok</boltAction></boltArtifact>',
  modeConstruction: true,
  fichiersRefuses: false,
  segments: 1,
  fileActions: 1,
  messageId: 'fixture',
};

describe('stream terminal receipts describe transport, not application verification', () => {
  it.each(['error', 'unknown', 'content-filter', 'tool-calls', 'other', 'sensitive-unrecognized-finish'])(
    'never certifies %s as completed',
    (finishReason) => {
      const receipt = createStreamTerminal({ ...input, finishReason });
      expect(receipt.status).not.toBe('complete');
      expect(JSON.stringify(receipt)).not.toContain('sensitive-unrecognized-finish');
      expect(JSON.stringify(receipt)).not.toContain('filePath');
    },
  );
  it('counts an open action even when an earlier action closed', () => {
    expect(countOpenStreamBlocks(input.content + '<boltArtifact id="y"><boltAction type="file">partial')).toEqual({
      openActions: 1,
      openArtifacts: 1,
    });
  });
  it('treats a split header as incomplete and a cumulative closed continuation as complete', () => {
    const prefix = '<boltArtifact id="x"><boltAction type="file"';
    expect(createStreamTerminal({ ...input, content: prefix }).reason).toBe('open-action');
    expect(
      createStreamTerminal({ ...input, content: prefix + '>done</boltAction></boltArtifact>', segments: 2 }).status,
    ).toBe('complete');
  });
  it('reports length exhaustion even when the currently emitted tags happen to close', () => {
    expect(createStreamTerminal({ ...input, finishReason: 'length', segments: 2 })).toMatchObject({
      status: 'incomplete',
      reason: 'output-limit',
    });
  });
  it('distinguishes no-file builds from discussion and explicit refusal', () => {
    expect(createStreamTerminal({ ...input, content: 'announcement', fileActions: 0 }).reason).toBe('no-files');
    expect(
      createStreamTerminal({ ...input, content: 'explanation', fileActions: 0, modeConstruction: false }).status,
    ).toBe('complete');
    expect(createStreamTerminal({ ...input, content: 'plan', fileActions: 0, fichiersRefuses: true }).status).toBe(
      'complete',
    );
  });
  it('validates unknown annotations, counts, consistency, and message identity', () => {
    const complete = createStreamTerminal(input);
    expect(latestStreamTerminal(undefined)).toBeUndefined();
    expect(latestStreamTerminal([complete], 'other')).toBeUndefined();

    for (const invalid of [
      { ...complete, segments: -1 },
      { ...complete, fileActions: NaN },
      { ...complete, finishReason: 'unknown' },
      { ...complete, openActions: 1 },
      { ...complete, messageId: 3 },
    ]) {
      expect(latestStreamTerminal([invalid])).toBeUndefined();
    }

    const incomplete = createStreamTerminal({ ...input, finishReason: 'length' });
    expect(latestStreamTerminal([complete, incomplete], 'fixture')).toEqual(incomplete);
  });
});
