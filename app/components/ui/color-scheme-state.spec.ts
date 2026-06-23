import { describe, expect, it } from 'vitest';
import { seedColorSchemeState } from './color-scheme-state';
import { defaultDesignScheme } from '~/types/design-scheme';

describe('seedColorSchemeState', () => {
  it('returns defaults (deep-copied) when no designScheme is provided', () => {
    const state = seedColorSchemeState(undefined);

    expect(state.palette).toEqual(defaultDesignScheme.palette);
    expect(state.features).toEqual(defaultDesignScheme.features);
    expect(state.font).toEqual(defaultDesignScheme.font);

    // Mutating the seeded palette must not corrupt the shared default object.
    state.palette.primary = '#000000';
    expect(defaultDesignScheme.palette.primary).not.toBe('#000000');
  });

  it('merges the provided palette over defaults so missing roles stay populated', () => {
    const state = seedColorSchemeState({
      palette: { primary: '#123456' },
      features: ['shadow'],
      font: ['serif'],
    });

    expect(state.palette.primary).toBe('#123456');

    // Untouched roles fall back to defaults.
    expect(state.palette.background).toBe(defaultDesignScheme.palette.background);
    expect(state.features).toEqual(['shadow']);
    expect(state.font).toEqual(['serif']);
  });

  it('re-seeding discards prior edits and reflects only the current prop (Cancel/reopen semantics)', () => {
    const saved = {
      palette: { ...defaultDesignScheme.palette, primary: '#aaaaaa' },
      features: ['rounded'],
      font: ['sans-serif'],
    };

    // Simulate the user tweaking local state in the dialog.
    const edited = seedColorSchemeState(saved);
    edited.palette.primary = '#ffeedd';
    edited.features.push('gradient');

    // On Cancel / reopen we re-seed from the (unchanged) saved prop.
    const reseeded = seedColorSchemeState(saved);

    expect(reseeded.palette.primary).toBe('#aaaaaa');
    expect(reseeded.features).toEqual(['rounded']);
    expect(reseeded.features).not.toContain('gradient');
  });
});
