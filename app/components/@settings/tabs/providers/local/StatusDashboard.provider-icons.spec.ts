import { Globe, Monitor, Server } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { PROVIDER_ICON_COMPONENTS, getProviderIcon } from './StatusDashboard';
import { PROVIDER_ICONS } from './types';

describe('getProviderIcon', () => {
  it('maps every known provider to a real lucide component (a function, not a string name)', () => {
    for (const provider of Object.keys(PROVIDER_ICONS) as Array<keyof typeof PROVIDER_ICONS>) {
      const icon = getProviderIcon(provider);

      /*
       * The bug: PROVIDER_ICONS values are strings ('Server', 'Monitor', 'Globe').
       * A correct icon must be a renderable component reference, never a string.
       */
      expect(typeof PROVIDER_ICONS[provider]).toBe('string');
      expect(typeof icon).not.toBe('string');
      expect(icon).toBe(PROVIDER_ICON_COMPONENTS[provider]);
    }
  });

  it('resolves the expected component per provider', () => {
    expect(getProviderIcon('Ollama')).toBe(Server);
    expect(getProviderIcon('LMStudio')).toBe(Monitor);
    expect(getProviderIcon('OpenAILike')).toBe(Globe);
  });

  it('falls back to Server for unknown providers', () => {
    expect(getProviderIcon('SomethingElse')).toBe(Server);
    expect(getProviderIcon('')).toBe(Server);
  });
});
