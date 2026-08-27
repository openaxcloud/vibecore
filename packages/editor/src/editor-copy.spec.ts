import { describe, expect, it } from 'vitest';

import { editorCopyEn, editorCopyFr, formatEditorCopy, getEditorCopy } from './editor-copy.js';

describe('editor UI copy', () => {
  it('keeps English and French catalogs in parity', () => {
    expect(Object.keys(editorCopyFr).sort()).toEqual(Object.keys(editorCopyEn).sort());
  });

  it('selects French and safely interpolates symbol labels', () => {
    const copy = getEditorCopy('fr-FR');

    expect(copy.renameSymbol).toBe('Renommer le symbole');
    expect(formatEditorCopy(copy.insertSymbol, { symbol: '{' })).toBe('Insérer {');
  });

  it('falls back to English for unsupported or missing locales', () => {
    expect(getEditorCopy('de-DE')).toBe(editorCopyEn);
    expect(getEditorCopy()).toBe(editorCopyEn);
  });
});
