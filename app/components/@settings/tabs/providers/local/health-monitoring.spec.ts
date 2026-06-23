import { describe, it, expect } from 'vitest';
import { getActiveMonitorTargets } from './health-monitoring';
import type { IProviderConfig } from '~/types/model';

function makeProvider(name: string, enabled: boolean, baseUrl?: string): IProviderConfig {
  return {
    name,
    settings: { enabled, baseUrl },
    staticModels: [],
  } as unknown as IProviderConfig;
}

describe('getActiveMonitorTargets', () => {
  it('returns only enabled providers that have a base URL', () => {
    const targets = getActiveMonitorTargets([
      makeProvider('Ollama', true, 'http://127.0.0.1:11434'),
      makeProvider('LMStudio', false, 'http://127.0.0.1:1234'),
      makeProvider('OpenAILike', true, undefined),
    ]);

    expect(targets).toEqual([{ name: 'Ollama', baseUrl: 'http://127.0.0.1:11434' }]);
  });

  it('excludes enabled providers without a base URL', () => {
    const targets = getActiveMonitorTargets([makeProvider('Ollama', true, '')]);
    expect(targets).toEqual([]);
  });

  it('returns an empty array when no providers are passed', () => {
    expect(getActiveMonitorTargets([])).toEqual([]);
  });

  it('returns every enabled+configured provider so each can be torn down on unmount', () => {
    /*
     * The cleanup path in LocalProvidersTab stops monitoring for exactly the set
     * this helper returns. Proving the full set is returned proves no interval
     * is leaked on unmount.
     */
    const providers = [
      makeProvider('Ollama', true, 'http://127.0.0.1:11434'),
      makeProvider('LMStudio', true, 'http://127.0.0.1:1234'),
      makeProvider('OpenAILike', true, 'http://127.0.0.1:9000'),
    ];

    const targets = getActiveMonitorTargets(providers);

    expect(targets).toEqual([
      { name: 'Ollama', baseUrl: 'http://127.0.0.1:11434' },
      { name: 'LMStudio', baseUrl: 'http://127.0.0.1:1234' },
      { name: 'OpenAILike', baseUrl: 'http://127.0.0.1:9000' },
    ]);
  });
});
