import { describe, expect, it } from 'vitest';

import {
  formatMarketingBlogReadTime,
  getMarketingBlogPostCopy,
  marketingBlogDetailEn,
  marketingBlogDetailFr,
} from './marketing-blog-detail';

describe('marketing blog detail catalog', () => {
  it('keeps exact English and French key parity', () => {
    expect(Object.keys(marketingBlogDetailFr).sort()).toEqual(Object.keys(marketingBlogDetailEn).sort());
  });

  it('localizes every published article without changing its stable slug', () => {
    expect(getMarketingBlogPostCopy('introducing-e-code', 'fr')?.content).toContain('## Ce qui change');
    expect(getMarketingBlogPostCopy('building-at-scale-how-we-handle-10m-requests', 'fr')?.category).toBe('Ingénierie');
    expect(getMarketingBlogPostCopy('getting-started-with-e-code-in-5-minutes', 'fr')?.tags).toEqual([
      'tutoriel',
      'prise en main',
    ]);
    expect(getMarketingBlogPostCopy('unknown', 'fr')).toBeUndefined();
  });

  it('formats French reading time and falls back to English', () => {
    expect(formatMarketingBlogReadTime(5, 'fr')).toBe('5 min de lecture');
    expect(formatMarketingBlogReadTime(1, 'de')).toBe('1 min read');
  });
});
