import { describe, expect, it } from 'vitest';

import { clampTemplateTagsLimit } from './template-tags-limit';

describe('clampTemplateTagsLimit', () => {
  it('passes through a valid positive integer', () => {
    expect(clampTemplateTagsLimit(10)).toBe(10);
  });

  it('floors fractional values', () => {
    expect(clampTemplateTagsLimit(5.9)).toBe(5);
  });

  it('keeps zero as zero (empty bounded list, not a fallback)', () => {
    expect(clampTemplateTagsLimit(0)).toBe(0);
  });

  it('rejects negative limits so .slice(0, limit) cannot drop tags from the end', () => {
    expect(clampTemplateTagsLimit(-2)).toBe(30);
    expect(clampTemplateTagsLimit(-1)).toBe(30);
  });

  it('falls back for NaN and non-finite values', () => {
    expect(clampTemplateTagsLimit(Number.NaN)).toBe(30);
    expect(clampTemplateTagsLimit(Number.POSITIVE_INFINITY)).toBe(30);
    expect(clampTemplateTagsLimit(Number.NEGATIVE_INFINITY)).toBe(30);
  });

  it('honors a custom fallback', () => {
    expect(clampTemplateTagsLimit(-5, 7)).toBe(7);
    expect(clampTemplateTagsLimit(Number.NaN, 7)).toBe(7);
  });
});
