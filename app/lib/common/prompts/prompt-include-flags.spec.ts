import { describe, expect, it } from 'vitest';
import { getFineTunedPrompt } from './new-prompt';
import optimized from './optimized';
import { getSystemPrompt } from './prompts';

const cwd = '/home/project';
const sb = { isConnected: false, hasSelectedProject: false } as const;

/**
 * A3 (Wave A): the DB / mobile blocks load on demand. Callers that pass no flags
 * (create-summary, select-context, etc.) must get today's byte-identical prompt;
 * stream-text passes explicit signals. The no-signal case intentionally drops the
 * heavy blocks — that is the saving — but must keep the core + the connect stub,
 * and the signal path must restore the full blocks byte-for-byte.
 */
describe('A3 getFineTunedPrompt include flags', () => {
  it('defaults (no flags) === explicit include=true,true (byte-identical default path)', () => {
    expect(getFineTunedPrompt(cwd, sb)).toBe(getFineTunedPrompt(cwd, sb, undefined, true, true));
  });

  it('full DB+mobile blocks present when both signals on', () => {
    const p = getFineTunedPrompt(cwd, sb, undefined, true, true);

    // Heavy DB detail (unconditional line of the full block, absent from the stub).
    expect(p).toContain('Supabase project setup handled separately by user');
    expect(p).toContain('<mobile_app_instructions>');
    expect(p).toContain('React Native and Expo are ONLY supported');
  });

  it('plain web build (no signals): mobile absent, DB reduced to connect stub, core unchanged', () => {
    const full = getFineTunedPrompt(cwd, sb, undefined, true, true);
    const slim = getFineTunedPrompt(cwd, sb, undefined, false, false);

    // Mobile block dropped entirely.
    expect(slim).not.toContain('<mobile_app_instructions>');

    // Heavy DB detail dropped...
    expect(slim).not.toContain('Supabase project setup handled separately by user');

    // ...but the Supabase connect reminder behavior is preserved.
    expect(slim).toContain('<database_instructions>');
    expect(slim).toContain('connect to Supabase in chat box before proceeding');

    /*
     * Core AFTER the DB block (artifact_instructions .. design_instructions) is
     * byte-identical — dropping the DB/mobile blocks leaves the rest untouched.
     */
    const core = (s: string) => s.slice(s.indexOf('<artifact_instructions>'), s.indexOf('</design_instructions>'));
    expect(core(slim)).toBe(core(full));

    // The slim prompt is materially shorter.
    expect(slim.length).toBeLessThan(full.length);
  });
});

describe('A3 getSystemPrompt include flags', () => {
  it('defaults === explicit include=true,true', () => {
    expect(getSystemPrompt(cwd, sb)).toBe(getSystemPrompt(cwd, sb, undefined, true, true));
  });

  it('no signals: mobile absent, DB stub kept, heavy detail dropped', () => {
    const slim = getSystemPrompt(cwd, sb, undefined, false, false);
    expect(slim).not.toContain('<mobile_app_instructions>');
    expect(slim).not.toContain('NEVER skip RLS setup');
    expect(slim).toContain('<database_instructions>');
    expect(slim).toContain('connect to Supabase in the chat box');
  });
});

describe('A3 optimized include flags', () => {
  const opts = { cwd, allowedHtmlElements: ['div'], modificationTagName: 'mods', supabase: sb };

  it('defaults (no flags) === explicit include=true,true', () => {
    expect(optimized(opts)).toBe(
      optimized({ ...opts, includeDatabaseInstructions: true, includeMobileInstructions: true }),
    );
  });

  it('no signals: mobile absent, DB stub kept', () => {
    const slim = optimized({ ...opts, includeDatabaseInstructions: false, includeMobileInstructions: false });
    expect(slim).not.toContain('<mobile_app_instructions>');
    expect(slim).toContain('<database_instructions>');
    expect(slim).toContain('connect to Supabase in the chat box');
  });
});
