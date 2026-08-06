import { describe, expect, it } from 'vitest';

/*
 * BUG-USR-003: these user-area routes shipped without a `meta` export, so the browser
 * tab fell back to the generic root title "E-Code — AI application development platform".
 * Each must now declare a specific, human-readable "<Page> - E-Code" title.
 */

function titleOf(meta: unknown): string | undefined {
  const entries = typeof meta === 'function' ? (meta as (a: unknown) => unknown[])({}) : [];
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (entry && typeof entry === 'object' && 'title' in entry) {
      return (entry as { title?: string }).title;
    }
  }

  return undefined;
}

describe('user-area route titles (BUG-USR-003)', () => {
  it('forgot-password declares its own title', async () => {
    const mod = await import('./forgot-password');
    expect(titleOf(mod.meta)).toBe('Forgot password - E-Code');
  });

  it('desktop-settings declares its own title', async () => {
    const mod = await import('./desktop-settings');
    expect(titleOf(mod.meta)).toBe('Desktop settings - E-Code');
  });

  it('invitations declares its own title', async () => {
    const mod = await import('./invitations');
    expect(titleOf(mod.meta)).toBe('Invitations - E-Code');
  });
});
