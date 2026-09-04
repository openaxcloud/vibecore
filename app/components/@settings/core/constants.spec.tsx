/**
 * @vitest-environment jsdom
 */

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { TAB_ICONS } from './constants';

afterEach(() => {
  cleanup();
});

describe('TAB_ICONS custom provider icons', () => {
  /*
   * The four custom-SVG providers used to swallow the className passed by TabTile,
   * so they rendered at a hardcoded 16px with no hover/active color. They must now
   * forward className onto the <svg> so they inherit w-8 h-8 sizing + currentColor.
   */
  for (const id of ['gitlab', 'netlify', 'vercel', 'supabase'] as const) {
    it(`forwards className onto the ${id} icon svg`, () => {
      const Icon = TAB_ICONS[id];
      const { container } = render(<Icon className="w-8 h-8 text-[var(--vc-ide-accent-action)]" />);

      const svg = container.querySelector('svg');
      expect(svg).not.toBeNull();
      expect(svg?.getAttribute('class')).toBe('w-8 h-8 text-[var(--vc-ide-accent-action)]');
      expect(svg?.getAttribute('class')).not.toContain('w-4 h-4');
    });
  }
});
