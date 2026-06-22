import { describe, it, expect } from 'vitest';
import { validateChatDescription } from '~/lib/hooks/validateChatDescription';

describe('validateChatDescription', () => {
  it('reports a valid, changed description as valid', () => {
    expect(validateChatDescription('My new chat', 'Old chat')).toBe('valid');
  });

  it('treats an unchanged value (vs baseline) as unchanged', () => {
    expect(validateChatDescription('Same', 'Same')).toBe('unchanged');
  });

  it('trims both sides before comparing for change detection', () => {
    expect(validateChatDescription('  Same  ', 'Same')).toBe('unchanged');
  });

  it('rejects an empty/whitespace-only description by length', () => {
    expect(validateChatDescription('   ', 'Old chat')).toBe('invalid-length');
  });

  it('rejects a description longer than 100 characters', () => {
    expect(validateChatDescription('a'.repeat(101), 'Old chat')).toBe('invalid-length');
  });

  it('rejects disallowed characters', () => {
    expect(validateChatDescription('bad <script>', 'Old chat')).toBe('invalid-characters');
  });

  it('accepts common punctuation', () => {
    expect(validateChatDescription("Project notes (v2) - it's done!", 'Old chat')).toBe('valid');
  });

  /*
   * Regression for the stale-baseline bug: a second consecutive edit must be
   * diffed against the LAST-SAVED value, not the original pre-first-edit string.
   */
  describe('consecutive edits use the last-saved value as baseline', () => {
    it('editing back to the original (after a first save) is a genuine change vs the saved value', () => {
      const original = 'Original';
      const firstSave = 'First edit';

      // First edit: original -> firstSave is a real change.
      expect(validateChatDescription(firstSave, original)).toBe('valid');

      /*
       * Second edit back to the original, now diffed against the SAVED value,
       * is correctly treated as a real change (not silently skipped).
       */
      expect(validateChatDescription(original, firstSave)).toBe('valid');
    });

    it('re-submitting the just-saved value is correctly detected as unchanged', () => {
      const firstSave = 'First edit';
      expect(validateChatDescription(firstSave, firstSave)).toBe('unchanged');
    });

    it('an empty baseline (store-empty default) never crashes and treats empty input as unchanged', () => {
      expect(validateChatDescription('', '')).toBe('unchanged');
      expect(validateChatDescription('Anything', '')).toBe('valid');
    });
  });
});
