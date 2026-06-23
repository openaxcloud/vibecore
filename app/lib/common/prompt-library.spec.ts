import { describe, expect, it } from 'vitest';
import { PromptLibrary, type PromptOptions } from './prompt-library';

const options: PromptOptions = {
  cwd: '/home/project',
  allowedHtmlElements: [],
  modificationTagName: 'bolt_file_modifications',
};

describe('PromptLibrary.getPropmtFromLibrary', () => {
  it('returns the requested prompt for a known id', () => {
    const prompt = PromptLibrary.getPropmtFromLibrary('default', options);
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
  });

  it('falls back to the default prompt for an unknown id instead of throwing', () => {
    /*
     * Regression: previously threw a bare string ('Prompt Now Found'), which
     * bypassed the caller's `?? getSystemPrompt()` fallback and aborted the
     * chat stream.
     */
    let prompt: string | undefined;
    expect(() => {
      prompt = PromptLibrary.getPropmtFromLibrary('does-not-exist', options);
    }).not.toThrow();

    const expected = PromptLibrary.getPropmtFromLibrary('default', options);
    expect(prompt).toBe(expected);
  });

  it('never throws a non-Error value', () => {
    try {
      PromptLibrary.getPropmtFromLibrary('totally-bogus-id', options);
    } catch (error) {
      // If anything is thrown it must be a real Error, never a bare string.
      expect(error).toBeInstanceOf(Error);
    }
  });
});
