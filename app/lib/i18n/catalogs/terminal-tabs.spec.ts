import { describe, expect, it } from 'vitest';

import { terminalTabsEn, terminalTabsFr } from './terminal-tabs';

function tokens(value: string): string[] {
  return [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
}

describe('terminal-tabs catalog', () => {
  it('keeps EN/FR key parity with non-empty French copy', () => {
    expect(Object.keys(terminalTabsFr).sort()).toEqual(Object.keys(terminalTabsEn).sort());

    for (const key of Object.keys(terminalTabsEn) as Array<keyof typeof terminalTabsEn>) {
      expect(terminalTabsFr[key].trim().length, key).toBeGreaterThan(0);
    }
  });

  it('preserves the exact interpolation tokens in every French string', () => {
    for (const key of Object.keys(terminalTabsEn) as Array<keyof typeof terminalTabsEn>) {
      expect(tokens(terminalTabsFr[key]), key).toEqual(tokens(terminalTabsEn[key]));
    }
  });

  it('keeps frozen technical vocabulary identical (Shell noun, PTY dimensions)', () => {
    expect(terminalTabsFr['terminalTabs.pty.dimensions']).toBe('{cols}x{rows}');
    expect(terminalTabsFr['terminalTabs.sessions.max']).toContain('shells');

    // French copy keeps the "shell" term (consistent with the frozen Shell (Terminal) tab).
    expect(terminalTabsFr['terminalTabs.menu.kill']).toBe('Arrêter le shell');
  });
});
