import type { DesignScheme } from '~/types/design-scheme';
import { defaultDesignScheme } from '~/types/design-scheme';

export interface ColorSchemeLocalState {
  palette: { [key: string]: string };
  features: string[];
  font: string[];
}

/**
 * Derive the dialog's local editing state from the (optional) designScheme prop.
 *
 * This is the single source of truth for seeding/re-seeding the local state.
 * It is used both for the initial useState seed and whenever the dialog is
 * (re)opened, so that abandoned edits from a previous Cancel are discarded
 * rather than silently persisting (and being committed on a later Save).
 */
export function seedColorSchemeState(designScheme?: DesignScheme): ColorSchemeLocalState {
  if (designScheme) {
    return {
      palette: { ...defaultDesignScheme.palette, ...designScheme.palette },
      features: [...(designScheme.features || defaultDesignScheme.features)],
      font: [...(designScheme.font || defaultDesignScheme.font)],
    };
  }

  return {
    palette: { ...defaultDesignScheme.palette },
    features: [...defaultDesignScheme.features],
    font: [...defaultDesignScheme.font],
  };
}
