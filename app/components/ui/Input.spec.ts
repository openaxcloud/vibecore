import { describe, expect, it } from 'vitest';
import { inputBaseClassName } from './Input';

/**
 * Guards against the "non-existent theme color token" regression: the Input
 * primitive used `border-bolt-elements-border`, `bg-bolt-elements-background`,
 * `ring-bolt-elements-ring`, and `ring-offset-bolt-elements-background`, none of
 * which are real leaf tokens in uno.config.ts (bolt.elements only defines
 * `borderColor`, `borderColorActive`, and the `background.depth.*` scale). The
 * result was a transparent field, a border that fell back to the text color, and
 * an invisible focus-visible ring (a11y regression).
 */
describe('inputBaseClassName', () => {
  it('does not reference any non-existent theme tokens', () => {
    /*
     * `bg-bolt-elements-background` followed by a word boundary that is NOT `-depth`
     * (the background node is an object, only its depth leaves emit color rules).
     */
    expect(inputBaseClassName).not.toMatch(/(?<![-\w])bg-bolt-elements-background(?!-depth)/);

    // The `border` and `ring` leaves do not exist.
    expect(inputBaseClassName).not.toMatch(/border-bolt-elements-border(?![C-])/);
    expect(inputBaseClassName).not.toMatch(/ring-bolt-elements-ring\b/);

    // ring-offset must not point at the bare background object node either.
    expect(inputBaseClassName).not.toMatch(/ring-offset-bolt-elements-background(?!-depth)/);
  });

  it('uses the real border, background-depth, and active-border ring tokens', () => {
    expect(inputBaseClassName).toContain('border-bolt-elements-borderColor');
    expect(inputBaseClassName).toContain('bg-bolt-elements-background-depth-1');
    expect(inputBaseClassName).toContain('focus-visible:ring-bolt-elements-borderColorActive');
    expect(inputBaseClassName).toContain('ring-offset-bolt-elements-background-depth-1');
  });
});
