import { Cable, Globe, Monitor, Server, ArrowLeft } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import HealthStatusBadge from './HealthStatusBadge';
import type { ProviderName } from './types';

/**
 * Real lucide component references keyed by provider name.
 *
 * Note: `PROVIDER_ICONS` in ./types.ts stores plain icon *names* (strings),
 * which cannot be handed to `React.createElement` directly — doing so creates
 * a custom DOM element (e.g. `<Server>`) instead of rendering the icon.
 * This map provides the actual components so the dashboard renders real icons.
 */
export const PROVIDER_ICON_COMPONENTS: Record<ProviderName, LucideIcon> = {
  Ollama: Server,
  LMStudio: Monitor,
  OpenAILike: Globe,
};

/**
 * Resolve the lucide icon component for a provider, falling back to `Server`
 * for unknown providers.
 */
export function getProviderIcon(provider: string): LucideIcon {
  return PROVIDER_ICON_COMPONENTS[provider as ProviderName] ?? Server;
}
import { Button } from '~/components/ui/Button';
import { Card, CardContent } from '~/components/ui/Card';
import { useLocalModelHealth } from '~/lib/hooks/useLocalModelHealth';

// Status Dashboard Component
function StatusDashboard({ onBack }: { onBack: () => void }) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language ?? 'en';

  const { healthStatuses } = useLocalModelHealth();

  return (
    <div className="space-y-6">
      {/* Header with Back Button */}
      <div className="flex items-center gap-4 mb-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="bg-transparent hover:bg-transparent text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary transition-all duration-200 p-2"
          aria-label={t('settings.copy.backToDashboard_97ba1d39')}
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h2 className="text-xl font-semibold text-bolt-elements-textPrimary">
            {t('settings.copy.providerStatus_618b7067')}
          </h2>
          <p className="text-sm text-bolt-elements-textSecondary">
            {t('settings.copy.monitorTheHealthOfYourLocalAiProviders_ba2d1e99')}
          </p>
        </div>
      </div>

      {healthStatuses.length === 0 ? (
        <Card className="bg-bolt-elements-background-depth-2">
          <CardContent className="p-8 text-center">
            <Cable className="w-16 h-16 mx-auto text-bolt-elements-textTertiary mb-4" />
            <h3 className="text-lg font-medium text-bolt-elements-textPrimary mb-2">
              {t('settings.copy.noEndpointsConfigured_adc8fdd1')}
            </h3>
            <p className="text-sm text-bolt-elements-textSecondary">
              {t('settings.copy.configureAndEnableLocalProvidersToSeeTheir_a95597cb')}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {healthStatuses.map((status) => (
            <Card key={`${status.provider}-${status.baseUrl}`} className="bg-bolt-elements-background-depth-2">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-bolt-elements-background-depth-3 flex items-center justify-center">
                      {React.createElement(getProviderIcon(status.provider), {
                        className: 'w-5 h-5 text-bolt-elements-textPrimary',
                      })}
                    </div>
                    <div>
                      <h3 className="font-semibold text-bolt-elements-textPrimary">{status.provider}</h3>
                      <p className="text-xs text-bolt-elements-textSecondary font-mono">{status.baseUrl}</p>
                    </div>
                  </div>
                  <HealthStatusBadge status={status.status} responseTime={status.responseTime} />
                </div>

                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div className="text-center">
                    <div className="text-bolt-elements-textSecondary">{t('settings.copy.models_d17d2d78')}</div>
                    <div className="text-lg font-semibold text-bolt-elements-textPrimary">
                      {status.availableModels?.length || 0}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-bolt-elements-textSecondary">{t('settings.copy.version_dd167905')}</div>
                    <div className="text-lg font-semibold text-bolt-elements-textPrimary">
                      {status.version || t('settings.copy.unknown_b764cdc0')}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-bolt-elements-textSecondary">{t('settings.copy.lastCheck_2d424737')}</div>
                    <div className="text-lg font-semibold text-bolt-elements-textPrimary">
                      {status.lastChecked
                        ? new Date(status.lastChecked).toLocaleTimeString(language)
                        : t('settings.localProviders.never')}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default StatusDashboard;
