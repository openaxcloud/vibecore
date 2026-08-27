/* eslint-disable import/order */
import { Cpu, Server, BookOpen, Activity, PackageOpen, Monitor, Loader2, RotateCw, ExternalLink } from 'lucide-react';
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import ErrorBoundary from './ErrorBoundary';
import { ModelCardSkeleton } from './LoadingSkeleton';
import ModelCard from './ModelCard';
import ProviderCard from './ProviderCard';
import SetupGuide from './SetupGuide';
import StatusDashboard from './StatusDashboard';
import { getActiveMonitorTargets } from './health-monitoring';
import { OLLAMA_API_URL } from './types';
import { Button } from '~/components/ui/Button';
import { Card, CardContent, CardHeader } from '~/components/ui/Card';
import { ConfirmationDialog } from '~/components/ui/Dialog';
import { Switch } from '~/components/ui/Switch';
import { useToast } from '~/components/ui/use-toast';
import { useLocalModelHealth } from '~/lib/hooks/useLocalModelHealth';
import { useSettings } from '~/lib/hooks/useSettings';
import { LOCAL_PROVIDERS } from '~/lib/stores/settings';
import type { IProviderConfig } from '~/types/model';
import { logStore } from '~/lib/stores/logs';
import { providerBaseUrlEnvKeys } from '~/utils/constants';
import type { OllamaModel, LMStudioModel } from './types';

// Type definitions
type ViewMode = 'dashboard' | 'guide' | 'status';

export default function LocalProvidersTab() {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language ?? 'en';

  const { providers, updateProviderSettings } = useSettings();
  const [viewMode, setViewMode] = useState<ViewMode>('dashboard');
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([]);
  const [lmStudioModels, setLMStudioModels] = useState<LMStudioModel[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [isLoadingLMStudioModels, setIsLoadingLMStudioModels] = useState(false);
  const [modelPendingDelete, setModelPendingDelete] = useState<string | null>(null);
  const { toast } = useToast();
  const { startMonitoring, stopMonitoring } = useLocalModelHealth();

  // Memoized filtered providers to prevent unnecessary re-renders
  const filteredProviders = useMemo(() => {
    return Object.entries(providers || {})
      .filter(([key]) => [...LOCAL_PROVIDERS, 'OpenAILike'].includes(key))
      .map(([key, value]) => {
        const provider = value as IProviderConfig;
        const envKey = providerBaseUrlEnvKeys[key]?.baseUrlKey;
        const envUrl = envKey ? (import.meta.env[envKey] as string | undefined) : undefined;

        // Set default base URLs for local providers
        let defaultBaseUrl = provider.settings.baseUrl || envUrl;

        if (!defaultBaseUrl) {
          if (key === 'Ollama') {
            defaultBaseUrl = 'http://127.0.0.1:11434';
          } else if (key === 'LMStudio') {
            defaultBaseUrl = 'http://127.0.0.1:1234';
          }
        }

        return {
          name: key,
          settings: {
            ...provider.settings,
            baseUrl: defaultBaseUrl,
          },
          staticModels: provider.staticModels || [],
          getDynamicModels: provider.getDynamicModels,
          getApiKeyLink: provider.getApiKeyLink,
          labelForGetApiKey: provider.labelForGetApiKey,
          icon: provider.icon,
        } as IProviderConfig;
      })
      .sort((a, b) => {
        // Custom sort: Ollama first, then LMStudio, then OpenAILike
        const order = { Ollama: 0, LMStudio: 1, OpenAILike: 2 };
        return (order[a.name as keyof typeof order] || 3) - (order[b.name as keyof typeof order] || 3);
      });
  }, [providers]);

  const categoryEnabled = useMemo(() => {
    return filteredProviders.length > 0 && filteredProviders.every((p) => p.settings.enabled);
  }, [filteredProviders]);

  // Start/stop health monitoring for enabled providers.
  useEffect(() => {
    const targets = getActiveMonitorTargets(filteredProviders);

    targets.forEach((target) => {
      console.log(`[LocalProvidersTab] Starting monitoring for ${target.name} at ${target.baseUrl}`);
      startMonitoring(target.name, target.baseUrl);
    });

    /*
     * Tear down the polling intervals when the tab unmounts (or before the
     * effect re-runs). Without this, startMonitoring()'s setInterval kept firing
     * background health-check fetches for the lifetime of the page even after
     * the user navigated away from the Local Providers settings tab.
     */
    return () => {
      targets.forEach((target) => {
        console.log(`[LocalProvidersTab] Stopping monitoring for ${target.name} at ${target.baseUrl}`);
        stopMonitoring(target.name, target.baseUrl);
      });
    };
  }, [filteredProviders, startMonitoring, stopMonitoring]);

  // Fetch Ollama models when enabled
  useEffect(() => {
    const ollamaProvider = filteredProviders.find((p) => p.name === 'Ollama');

    if (ollamaProvider?.settings.enabled) {
      fetchOllamaModels();
    }
  }, [filteredProviders]);

  // Fetch LM Studio models when enabled
  useEffect(() => {
    const lmStudioProvider = filteredProviders.find((p) => p.name === 'LMStudio');

    if (lmStudioProvider?.settings.enabled && lmStudioProvider.settings.baseUrl) {
      fetchLMStudioModels(lmStudioProvider.settings.baseUrl);
    }
  }, [filteredProviders]);

  // Honor a user-configured Ollama base URL instead of always hitting localhost.
  const ollamaBaseUrl = filteredProviders.find((p) => p.name === 'Ollama')?.settings.baseUrl || OLLAMA_API_URL;

  const fetchOllamaModels = async () => {
    try {
      setIsLoadingModels(true);

      const response = await fetch(`${ollamaBaseUrl}/api/tags`);

      if (!response.ok) {
        throw new Error(t('settings.copy.failedToFetchModels_0b3be248'));
      }

      const data = (await response.json()) as { models: OllamaModel[] };
      setOllamaModels(
        data.models.map((model) => ({
          ...model,
          status: 'idle' as const,
        })),
      );
    } catch (error) {
      console.error('Error fetching Ollama models', error);

      /*
       * Surface the failure instead of swallowing it: a silent catch left the UI
       * showing a misleading "No Models Installed" empty state when Ollama was
       * simply unreachable.
       */
      toast(t('settings.localProviders.ollama.unreachable', { url: ollamaBaseUrl }), { type: 'error' });
    } finally {
      setIsLoadingModels(false);
    }
  };

  const fetchLMStudioModels = async (baseUrl: string) => {
    try {
      setIsLoadingLMStudioModels(true);

      const response = await fetch(`${baseUrl}/v1/models`);

      if (!response.ok) {
        throw new Error(t('settings.copy.failedToFetchLmStudioModels_c239153d'));
      }

      const data = (await response.json()) as { data: LMStudioModel[] };
      setLMStudioModels(data.data || []);
    } catch {
      console.error('Error fetching LM Studio models');
      setLMStudioModels([]);
    } finally {
      setIsLoadingLMStudioModels(false);
    }
  };

  const handleToggleCategory = useCallback(
    async (enabled: boolean) => {
      filteredProviders.forEach((provider) => {
        updateProviderSettings(provider.name, { ...provider.settings, enabled });
      });
      toast(enabled ? t('settings.localProviders.allEnabled') : t('settings.localProviders.allDisabled'));
    },
    [filteredProviders, updateProviderSettings, t, toast],
  );

  const handleToggleProvider = useCallback(
    (provider: IProviderConfig, enabled: boolean) => {
      updateProviderSettings(provider.name, {
        ...provider.settings,
        enabled,
      });

      const message = enabled
        ? t('settings.localProviders.providerEnabled', { provider: provider.name })
        : t('settings.localProviders.providerDisabled', { provider: provider.name });
      logStore.logProvider(message, {
        provider: provider.name,
      });
      toast(message);
    },
    [updateProviderSettings, t, toast],
  );

  const handleUpdateBaseUrl = useCallback(
    (provider: IProviderConfig, newBaseUrl: string) => {
      updateProviderSettings(provider.name, {
        ...provider.settings,
        baseUrl: newBaseUrl,
      });
      toast(t('settings.localProviders.baseUrlUpdated', { provider: provider.name }));
    },
    [updateProviderSettings, t, toast],
  );

  const handleUpdateOllamaModel = async (modelName: string) => {
    try {
      setOllamaModels((prev) => prev.map((m) => (m.name === modelName ? { ...m, status: 'updating' } : m)));

      const response = await fetch(`${ollamaBaseUrl}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelName }),
      });

      if (!response.ok) {
        throw new Error(t('settings.localProviders.modelUpdateFailed', { model: modelName }));
      }

      // Handle streaming response
      const reader = response.body?.getReader();

      if (!reader) {
        throw new Error(t('settings.copy.noResponseReaderAvailable_f8d0dbf8'));
      }

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        const text = new TextDecoder().decode(value);
        const lines = text.split('\n').filter(Boolean);

        for (const line of lines) {
          try {
            const data = JSON.parse(line);

            if (data.status && data.completed && data.total) {
              setOllamaModels((current) =>
                current.map((m) =>
                  m.name === modelName
                    ? {
                        ...m,
                        progress: {
                          current: data.completed,
                          total: data.total,
                          status: data.status,
                        },
                      }
                    : m,
                ),
              );
            }
          } catch {
            // Ignore parsing errors
          }
        }
      }

      setOllamaModels((prev) =>
        prev.map((m) => (m.name === modelName ? { ...m, status: 'updated', progress: undefined } : m)),
      );
      toast(t('settings.localProviders.modelUpdated', { model: modelName }));
    } catch {
      setOllamaModels((prev) =>
        prev.map((m) => (m.name === modelName ? { ...m, status: 'error', progress: undefined } : m)),
      );
      toast(t('settings.localProviders.modelUpdateFailed', { model: modelName }), { type: 'error' });
    }
  };

  const handleDeleteOllamaModel = (modelName: string) => {
    setModelPendingDelete(modelName);
  };

  const performDeleteOllamaModel = async (modelName: string) => {
    try {
      const response = await fetch(`${ollamaBaseUrl}/api/delete`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelName }),
      });

      if (!response.ok) {
        throw new Error(t('settings.localProviders.modelDeleteFailed', { model: modelName }));
      }

      setOllamaModels((current) => current.filter((m) => m.name !== modelName));
      toast(t('settings.localProviders.modelDeleted', { model: modelName }));
    } catch {
      toast(t('settings.localProviders.modelDeleteFailed', { model: modelName }), { type: 'error' });
    }
  };

  // Render different views based on viewMode
  if (viewMode === 'guide') {
    return (
      <ErrorBoundary>
        <SetupGuide onBack={() => setViewMode('dashboard')} />
      </ErrorBoundary>
    );
  }

  if (viewMode === 'status') {
    return (
      <ErrorBoundary>
        <StatusDashboard onBack={() => setViewMode('dashboard')} />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <div className="space-y-6">
        <ConfirmationDialog
          isOpen={modelPendingDelete !== null}
          onClose={() => setModelPendingDelete(null)}
          onConfirm={() => {
            const modelName = modelPendingDelete;
            setModelPendingDelete(null);

            if (modelName) {
              void performDeleteOllamaModel(modelName);
            }
          }}
          title={t('settings.localProviders.deleteModelTitle', {
            model: modelPendingDelete ?? t('settings.localProviders.thisModel'),
          })}
          description={t('settings.copy.theModelIsRemovedFromYourLocalOllama_493efb34')}
          confirmLabel={t('settings.localProviders.deleteModel')}
          variant="destructive"
        />
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-[color-mix(in_srgb,var(--vc-ide-accent-action)_18%,transparent)] flex items-center justify-center ring-1 ring-[color-mix(in_srgb,var(--vc-ide-accent-action)_30%,transparent)]">
              <Cpu className="w-6 h-6 text-[var(--vc-ide-accent-action)]" />
            </div>
            <div>
              <h2 className="text-2xl font-semibold text-bolt-elements-textPrimary">
                {t('settings.copy.localAiProviders_96f3a73f')}
              </h2>
              <p className="text-sm text-bolt-elements-textSecondary">
                {t('settings.copy.configureAndManageYourLocalAiModels_c35365c0')}
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-bolt-elements-textSecondary">
                {t('settings.copy.enableAll_87b3b5dd')}
              </span>
              <Switch
                checked={categoryEnabled}
                onCheckedChange={handleToggleCategory}
                aria-label={t('settings.copy.toggleAllLocalProviders_465107a9')}
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setViewMode('guide')}
                className="bg-bolt-elements-background-depth-2 hover:bg-bolt-elements-background-depth-3 border-bolt-elements-borderColor hover:border-[color-mix(in_srgb,var(--vc-ide-accent-action)_30%,transparent)] transition-all duration-200 gap-2"
              >
                <BookOpen className="w-4 h-4" />
                {t('settings.copy.setupGuide_03418fd0')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setViewMode('status')}
                className="bg-bolt-elements-background-depth-2 hover:bg-bolt-elements-background-depth-3 border-bolt-elements-borderColor hover:border-[color-mix(in_srgb,var(--vc-ide-accent-action)_30%,transparent)] transition-all duration-200 gap-2"
              >
                <Activity className="w-4 h-4" />
                {t('settings.copy.status_920e413c')}
              </Button>
            </div>
          </div>
        </div>

        {/* Provider Cards */}
        <div className="space-y-6">
          {filteredProviders.map((provider) => (
            <div key={provider.name} className="space-y-4">
              <ProviderCard
                provider={provider}
                onToggle={(enabled) => handleToggleProvider(provider, enabled)}
                onUpdateBaseUrl={(url) => handleUpdateBaseUrl(provider, url)}
                isEditing={editingProvider === provider.name}
                onStartEditing={() => setEditingProvider(provider.name)}
                onStopEditing={() => setEditingProvider(null)}
              />

              {/* Ollama Models Section */}
              {provider.name === 'Ollama' && provider.settings.enabled && (
                <Card className="mt-4 bg-bolt-elements-background-depth-2">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <PackageOpen className="w-5 h-5 text-[var(--vc-ide-accent-action)]" />
                        <h3 className="text-lg font-semibold text-bolt-elements-textPrimary">
                          {t('settings.copy.installedModels_672a72ad')}
                        </h3>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={fetchOllamaModels}
                        disabled={isLoadingModels}
                        className="bg-transparent hover:bg-bolt-elements-background-depth-2"
                      >
                        {isLoadingModels ? (
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        ) : (
                          <RotateCw className="w-4 h-4 mr-2" />
                        )}
                        {t('settings.copy.refresh_0e916101')}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {isLoadingModels ? (
                      <div className="space-y-4">
                        {Array.from({ length: 3 }).map((_, i) => (
                          <ModelCardSkeleton key={i} />
                        ))}
                      </div>
                    ) : ollamaModels.length === 0 ? (
                      <div className="text-center py-8">
                        <PackageOpen className="w-16 h-16 mx-auto text-bolt-elements-textTertiary mb-4" />
                        <h3 className="text-lg font-medium text-bolt-elements-textPrimary mb-2">
                          {t('settings.copy.noModelsInstalled_b31146f0')}
                        </h3>
                        <p className="text-sm text-bolt-elements-textSecondary mb-4">
                          {t('settings.copy.visit_1c8ac867')}{' '}
                          <a
                            href="https://ollama.com/library"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[var(--vc-ide-accent-action)] hover:underline inline-flex items-center gap-1"
                          >
                            {t('settings.copy.ollamaComLibrary_57198fd8')}
                            <ExternalLink className="w-3 h-3" />
                          </a>{' '}
                          {t('settings.copy.toBrowseAvailableModels_c8726096')}
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="bg-[color-mix(in_srgb,var(--vc-ide-accent-action)_8%,transparent)] hover:bg-[color-mix(in_srgb,var(--vc-ide-accent-action)_15%,transparent)] border-[color-mix(in_srgb,var(--vc-ide-accent-action)_25%,transparent)] hover:border-[color-mix(in_srgb,var(--vc-ide-accent-action)_40%,transparent)] transition-all duration-300 gap-2 group shadow-sm hover:shadow-md font-medium"
                          _asChild
                        >
                          <a
                            href="https://ollama.com/library"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-2"
                          >
                            <ExternalLink className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-300 flex-shrink-0" />
                            <span className="flex-1 text-center font-medium">
                              {t('settings.copy.browseModels_b556fa77')}
                            </span>
                          </a>
                        </Button>
                      </div>
                    ) : (
                      <div className="grid gap-4">
                        {ollamaModels.map((model) => (
                          <ModelCard
                            key={model.name}
                            model={model}
                            onUpdate={() => handleUpdateOllamaModel(model.name)}
                            onDelete={() => handleDeleteOllamaModel(model.name)}
                          />
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* LM Studio Models Section */}
              {provider.name === 'LMStudio' && provider.settings.enabled && (
                <Card className="mt-4 bg-bolt-elements-background-depth-2">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Monitor className="w-5 h-5 text-blue-500" />
                        <h3 className="text-lg font-semibold text-bolt-elements-textPrimary">
                          {t('settings.copy.availableModels_14494560')}
                        </h3>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fetchLMStudioModels(provider.settings.baseUrl!)}
                        disabled={isLoadingLMStudioModels}
                        className="bg-transparent hover:bg-bolt-elements-background-depth-2"
                      >
                        {isLoadingLMStudioModels ? (
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        ) : (
                          <RotateCw className="w-4 h-4 mr-2" />
                        )}
                        {t('settings.copy.refresh_0e916101')}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {isLoadingLMStudioModels ? (
                      <div className="space-y-4">
                        {Array.from({ length: 3 }).map((_, i) => (
                          <ModelCardSkeleton key={i} />
                        ))}
                      </div>
                    ) : lmStudioModels.length === 0 ? (
                      <div className="text-center py-8">
                        <Monitor className="w-16 h-16 mx-auto text-bolt-elements-textTertiary mb-4" />
                        <h3 className="text-lg font-medium text-bolt-elements-textPrimary mb-2">
                          {t('settings.copy.noModelsAvailable_906fca33')}
                        </h3>
                        <p className="text-sm text-bolt-elements-textSecondary mb-4">
                          {t('settings.copy.makeSureLmStudioIsRunningWithThe_e527657d')}
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="bg-gradient-to-r from-blue-500/8 to-blue-600/8 hover:from-blue-500/15 hover:to-blue-600/15 border-blue-500/25 hover:border-blue-500/40 transition-all duration-300 gap-2 group shadow-sm hover:shadow-md font-medium"
                          _asChild
                        >
                          <a
                            href="https://lmstudio.ai/"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-2"
                          >
                            <ExternalLink className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-300 flex-shrink-0" />
                            <span className="flex-1 text-center font-medium">
                              {t('settings.copy.getLmStudio_047c5f4f')}
                            </span>
                          </a>
                        </Button>
                      </div>
                    ) : (
                      <div className="grid gap-4">
                        {lmStudioModels.map((model) => (
                          <Card key={model.id} className="bg-bolt-elements-background-depth-3">
                            <CardContent className="p-4">
                              <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <h4 className="text-sm font-medium text-bolt-elements-textPrimary font-mono">
                                    {model.id}
                                  </h4>
                                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-500">
                                    {t('settings.copy.available_e6744473')}
                                  </span>
                                </div>
                                <div className="flex items-center gap-4 text-xs text-bolt-elements-textSecondary">
                                  <div className="flex items-center gap-1">
                                    <Server className="w-3 h-3" />
                                    <span>{model.object}</span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <Activity className="w-3 h-3" />
                                    <span>
                                      {t('settings.copy.ownedBy_1fad1458')} {model.owned_by}
                                    </span>
                                  </div>
                                  {model.created && (
                                    <div className="flex items-center gap-1">
                                      <Activity className="w-3 h-3" />
                                      <span>
                                        {t('settings.copy.created_22d435a3')}{' '}
                                        {new Date(model.created * 1000).toLocaleDateString(language)}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          ))}
        </div>

        {filteredProviders.length === 0 && (
          <Card className="bg-bolt-elements-background-depth-2">
            <CardContent className="p-8 text-center">
              <Server className="w-16 h-16 mx-auto text-bolt-elements-textTertiary mb-4" />
              <h3 className="text-lg font-medium text-bolt-elements-textPrimary mb-2">
                {t('settings.copy.noLocalProvidersAvailable_e31262b5')}
              </h3>
              <p className="text-sm text-bolt-elements-textSecondary">
                {t('settings.copy.localProvidersWillAppearHereWhenTheyRe_83d24736')}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </ErrorBoundary>
  );
}
