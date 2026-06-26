import { describe, expect, it } from 'vitest';

import { EDITOR_SETTINGS_DEFAULTS, normalizeEditorSettings } from './editor-settings';

describe('editor-settings', () => {
  it('returns defaults for empty/invalid input', () => {
    expect(normalizeEditorSettings(undefined)).toEqual(EDITOR_SETTINGS_DEFAULTS);
    expect(normalizeEditorSettings(null)).toEqual(EDITOR_SETTINGS_DEFAULTS);
    expect(normalizeEditorSettings({})).toEqual(EDITOR_SETTINGS_DEFAULTS);
  });

  it('clamps font size into [10,28] and rounds', () => {
    expect(normalizeEditorSettings({ fontSize: 4 }).fontSize).toBe(10);
    expect(normalizeEditorSettings({ fontSize: 99 }).fontSize).toBe(28);
    expect(normalizeEditorSettings({ fontSize: 15.6 }).fontSize).toBe(16);
    expect(normalizeEditorSettings({ fontSize: Number.NaN }).fontSize).toBe(EDITOR_SETTINGS_DEFAULTS.fontSize);
  });

  it('only accepts allowed tab sizes', () => {
    expect(normalizeEditorSettings({ tabSize: 4 }).tabSize).toBe(4);
    expect(normalizeEditorSettings({ tabSize: 8 }).tabSize).toBe(8);
    expect(normalizeEditorSettings({ tabSize: 3 }).tabSize).toBe(2);
  });

  it('coerces booleans', () => {
    const s = normalizeEditorSettings({ wordWrap: true, vimMode: true, formatOnSave: true });
    expect(s.wordWrap).toBe(true);
    expect(s.vimMode).toBe(true);
    expect(s.formatOnSave).toBe(true);
  });
});
