import { describe, expect, it } from 'vitest';
import { AppliedFilesToastBuffer } from './applied-files-toast-buffer';

describe('AppliedFilesToastBuffer', () => {
  it('starts empty', () => {
    const buffer = new AppliedFilesToastBuffer();

    expect(buffer.isEmpty()).toBe(true);
    expect(buffer.size).toBe(0);
    expect(buffer.snapshot()).toEqual({ files: [], proposalIds: [] });
  });

  it('accumulates every item across flushes (regression: coalesced toast lost prior batches)', () => {
    const buffer = new AppliedFilesToastBuffer();

    /*
     * Simulate a multi-file agent turn where each accepted file is added in its
     * own debounce window, each followed by a flush reading the snapshot.
     */
    buffer.add('src/a.ts', 'p1');

    const firstFlush = buffer.snapshot();
    expect(firstFlush.files).toEqual(['src/a.ts']);
    expect(firstFlush.proposalIds).toEqual(['p1']);

    buffer.add('src/b.ts', 'p2');
    buffer.add('src/c.ts', 'p3');

    // Critically, the snapshot still carries the earlier batch, not just the last.
    const laterFlush = buffer.snapshot();
    expect(laterFlush.files).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts']);
    expect(laterFlush.proposalIds).toEqual(['p1', 'p2', 'p3']);
    expect(buffer.size).toBe(3);
  });

  it('preserves insertion order', () => {
    const buffer = new AppliedFilesToastBuffer();

    buffer.add('z.ts', 'z');
    buffer.add('a.ts', 'a');
    buffer.add('m.ts', 'm');

    expect(buffer.snapshot().proposalIds).toEqual(['z', 'a', 'm']);
  });

  it('de-duplicates by proposal id and refreshes the file path without reordering', () => {
    const buffer = new AppliedFilesToastBuffer();

    buffer.add('old/path.ts', 'p1');
    buffer.add('src/b.ts', 'p2');
    buffer.add('new/path.ts', 'p1');

    expect(buffer.size).toBe(2);

    const snapshot = buffer.snapshot();
    expect(snapshot.proposalIds).toEqual(['p1', 'p2']);
    expect(snapshot.files).toEqual(['new/path.ts', 'src/b.ts']);
  });

  it('resets only when explicitly told (toast closed)', () => {
    const buffer = new AppliedFilesToastBuffer();

    buffer.add('a.ts', 'p1');
    buffer.add('b.ts', 'p2');
    expect(buffer.size).toBe(2);

    buffer.reset();
    expect(buffer.isEmpty()).toBe(true);
    expect(buffer.snapshot()).toEqual({ files: [], proposalIds: [] });

    // A fresh turn after reset starts a new accumulation.
    buffer.add('c.ts', 'p3');
    expect(buffer.snapshot().proposalIds).toEqual(['p3']);
  });

  it('supports chaining add() calls', () => {
    const buffer = new AppliedFilesToastBuffer().add('a.ts', 'p1').add('b.ts', 'p2');

    expect(buffer.snapshot().proposalIds).toEqual(['p1', 'p2']);
  });
});
