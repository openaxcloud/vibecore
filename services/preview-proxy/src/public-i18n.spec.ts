import { describe, expect, it } from 'vitest';

import { getPreviewProxyCopy, previewProxyEn, previewProxyFr, resolvePreviewProxyLanguage } from './public-i18n.js';

describe('preview proxy public i18n', () => {
  it('keeps exact English and French key parity', () => {
    expect(Object.keys(previewProxyFr).sort()).toEqual(Object.keys(previewProxyEn).sort());
    expect(previewProxyFr.PREVIEW_UPSTREAM_ERROR).toContain('service d’aperçu');
    expect(Object.values(previewProxyFr).join(' ')).not.toMatch(/prévisualis/iu);
  });

  it('honors manual then automatic cookies before weighted Accept-Language', () => {
    expect(
      resolvePreviewProxyLanguage({
        cookie: 'vibecore-auto-lang=fr; vibecore-lang=en',
        'accept-language': 'fr-FR',
      }),
    ).toBe('en');
    expect(resolvePreviewProxyLanguage({ cookie: 'vibecore-auto-lang=fr', 'accept-language': 'en-US' })).toBe('fr');
    expect(resolvePreviewProxyLanguage({ 'accept-language': 'en;q=0.2, fr-FR;q=0.9' })).toBe('fr');
    expect(resolvePreviewProxyLanguage({ 'accept-language': 'de-DE' })).toBe('en');
  });

  it('falls back to complete English copy without exposing catalogue keys', () => {
    const copy = getPreviewProxyCopy({ 'accept-language': 'de-DE' });
    expect(copy).toBe(previewProxyEn);
    expect(copy.PREVIEW_UPSTREAM_ERROR).not.toContain('PREVIEW_UPSTREAM_ERROR');
  });
});
