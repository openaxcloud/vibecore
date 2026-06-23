import type { IProviderConfig } from '~/types/model';

export type LocalProviderName = 'Ollama' | 'LMStudio' | 'OpenAILike';

export interface MonitorTarget {
  name: LocalProviderName;
  baseUrl: string;
}

/**
 * Pure helper that, given the list of (filtered) local providers, returns the
 * set of providers whose health should be actively monitored — i.e. those that
 * are enabled and have a base URL configured.
 *
 * Extracted so the effect that wires up / tears down the polling intervals can
 * be reasoned about (and unit-tested) without rendering the React component or
 * touching the singleton health monitor.
 */
export function getActiveMonitorTargets(providers: IProviderConfig[]): MonitorTarget[] {
  const targets: MonitorTarget[] = [];

  for (const provider of providers) {
    const baseUrl = provider.settings.baseUrl;

    if (provider.settings.enabled && baseUrl) {
      targets.push({ name: provider.name as LocalProviderName, baseUrl });
    }
  }

  return targets;
}
