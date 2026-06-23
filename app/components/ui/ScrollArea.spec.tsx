import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// eslint-disable-next-line no-restricted-imports -- reads the root UnoCSS config to validate theme tokens in this test
import theme from '../../../uno.config';

/**
 * Helper: walk the UnoCSS theme `colors` tree and collect every dotted token
 * path that maps to a (string) color value, e.g. `bolt.elements.borderColor`.
 * The generated background utility for such a path is `bg-<path with dots -> dashes>`.
 */
function collectColorTokenPaths(colors: unknown, prefix = ''): string[] {
  if (!colors || typeof colors !== 'object') {
    return [];
  }

  return Object.entries(colors as Record<string, unknown>).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;

    if (typeof value === 'string') {
      return [path];
    }

    return collectColorTokenPaths(value, path);
  });
}

describe('ScrollArea theme tokens', () => {
  // The class the scrollbar thumb uses, minus the `bg-` utility prefix.
  const THUMB_TOKEN_PATH = 'bolt.elements.borderColor';
  const BROKEN_TOKEN_PATH = 'bolt.elements.border';

  it('uses a thumb background token that actually exists in the UnoCSS theme', () => {
    const colors = (theme as { theme?: { colors?: unknown } }).theme?.colors;
    const tokenPaths = collectColorTokenPaths(colors);

    /*
     * The token the component relies on must resolve to a real color value,
     * otherwise `bg-bolt-elements-borderColor` generates no CSS and the thumb
     * renders transparent (the original bug).
     */
    expect(tokenPaths).toContain(THUMB_TOKEN_PATH);

    // Guard against regressing back to the non-existent token.
    expect(tokenPaths).not.toContain(BROKEN_TOKEN_PATH);
  });

  it('styles the scrollbar thumb with the valid background utility class', () => {
    /*
     * Radix only mounts the thumb element when the scrollbar is visible, which
     * requires real layout measurement (absent in jsdom). Assert directly on
     * the component source that the thumb uses the resolvable token and not the
     * broken one that rendered transparent.
     */
    const source = readFileSync(fileURLToPath(new URL('./ScrollArea.tsx', import.meta.url)), 'utf8');
    const thumbMatch = source.match(/ScrollAreaThumb[^>]*className="([^"]*)"/);

    expect(thumbMatch).not.toBeNull();

    const thumbClass = thumbMatch![1];
    expect(thumbClass).toContain('bg-bolt-elements-borderColor');

    // The invisible-thumb bug: must not use the unresolved token.
    expect(thumbClass).not.toMatch(/\bbg-bolt-elements-border\b/);
  });
});
