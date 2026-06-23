import { describe, it, expect } from 'vitest';
import { badgeVariants } from './Badge';

/**
 * Regression: the `default` and `secondary` Badge variants used to reference
 * `bg-bolt-elements-background`, which is NOT a real UnoCSS token — in
 * uno.config.ts `bolt.elements.background` is a nested object whose only leaves
 * are `background.depth.1..4`. As a result UnoCSS emitted no background rule and
 * the badge rendered with no fill. Both variants must now use a real depth token.
 */
describe('badgeVariants backgrounds', () => {
  for (const variant of ['default', 'secondary'] as const) {
    it(`${variant} uses a resolvable depth background token`, () => {
      const classes = badgeVariants({ variant });

      /*
       * The broken, non-resolving token must be gone (not even as a prefix of the
       * depth token — assert the bare class with a word boundary).
       */
      expect(classes).not.toMatch(/bg-bolt-elements-background(?![-/\w])/);
      expect(classes).not.toContain('hover:bg-bolt-elements-background/80');

      // It must use a real depth-based token instead.
      expect(classes).toContain('bg-bolt-elements-background-depth-2');
      expect(classes).toContain('hover:bg-bolt-elements-background-depth-3');
    });
  }

  it('default is the fallback variant', () => {
    expect(badgeVariants()).toContain('bg-bolt-elements-background-depth-2');
  });
});
