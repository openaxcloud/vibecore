import { describe, expect, it } from 'vitest';
import { computeInlineDiff } from './file-history-diff';

describe('computeInlineDiff', () => {
  it('reports no changes for identical content', () => {
    const diff = computeInlineDiff('a\nb\nc', 'a\nb\nc');
    expect(diff.added).toBe(0);
    expect(diff.removed).toBe(0);
    expect(diff.lines.every((l) => l.type === 'unchanged')).toBe(true);
  });

  it('counts a real addition', () => {
    const diff = computeInlineDiff('a\nb', 'a\nb\nc');
    expect(diff.added).toBe(1);
    expect(diff.removed).toBe(0);
    expect(diff.lines.find((l) => l.type === 'added')?.text).toBe('c');
  });

  it('counts a real deletion', () => {
    const diff = computeInlineDiff('a\nb\nc', 'a\nc');
    expect(diff.removed).toBe(1);
    expect(diff.lines.find((l) => l.type === 'removed')?.text).toBe('b');
  });

  it('counts a modification as one removal and one addition', () => {
    const diff = computeInlineDiff('hello world', 'hello there');
    expect(diff.added).toBe(1);
    expect(diff.removed).toBe(1);
  });

  it('preserves unchanged surrounding lines in order', () => {
    const diff = computeInlineDiff('one\ntwo\nthree', 'one\nTWO\nthree');
    const texts = diff.lines.map((l) => l.text);
    expect(texts[0]).toBe('one');
    expect(texts[texts.length - 1]).toBe('three');
    expect(diff.added).toBe(1);
    expect(diff.removed).toBe(1);
  });
});
