import React, { useEffect, useState, useCallback } from 'react';
import { Switch } from '~/components/ui/Switch';
import { useSettings } from '~/lib/hooks/useSettings';
import { LOCAL_PROVIDERS, URL_CONFIGURABLE_PROVIDERS } from '~/lib/stores/settings';
import type { IProviderConfig } from '~/types/model';
import { logStore } from '~/lib/stores/logs';
import { motion } from 'framer-motion';
import { classNames } from '~/utils/classNames';
import { settingsStyles } from '~/components/settings/settings.styles';
import { BsRobot } from 'react-icons/bs';
import type { IconType } from 'react-icons';
import { BiChip } from 'react-icons/bi';
import { TbBrandOpenai } from 'react-icons/tb';
import { providerBaseUrlEnvKeys } from '~/utils/constants';
import { useToast } from '~/components/ui/use-toast';

// Add type for provider names to ensure type safety
type ProviderName = 'Ollama' | 'LMStudio' | 'OpenAILike';

// Update the PROVIDER_ICONS type to use the ProviderName type
const PROVIDER_ICONS: Record<ProviderName, IconType> = {
  Ollama: BsRobot,
  LMStudio: BsRobot,
  OpenAILike: TbBrandOpenai,
};

// Update PROVIDER_DESCRIPTIONS to use the same type
const PROVIDER_DESCRIPTIONS: Record<ProviderName, string> = {
  Ollama: 'Run open-source models locally on your machine',
  LMStudio: 'Local model inference with LM Studio',
  OpenAILike: 'Connect to OpenAI-compatible API endpoints',
};

// Add a constant for the Ollama API base URL
const OLLAMA_API_URL = 'http://127.0.0.1:11434';

interface OllamaModel {
  name: string;
  digest: string;
  size: number;
  modified_at: string;
  details?: {
    family: string;
    parameter_size: string;
    quantization_level: string;
  };
  status?: 'idle' | 'updating' | 'updated' | 'error' | 'checking';
  error?: string;
  newDigest?: string;
  progress?: {
    current: number;
    total: number;
    status: string;
  };
}

interface OllamaServiceStatus {
  isRunning: boolean;
  lastChecked: Date;
  error?: string;
}

interface OllamaPullResponse {
  status: string;
  completed?: number;
  total?: number;
  digest?: string;
}

const isOllamaPullResponse = (data: unknown): data is OllamaPullResponse => {
  return (
    typeof data === 'object' &&
    data !== null &&
    'status' in data &&
    typeof (data as OllamaPullResponse).status === 'string'
  );
};

interface ManualInstallState {
  isOpen: boolean;
  modelString: string;
}

export function LocalProvidersTab() {
  const { success, error } = useToast();
  const { providers, updateProviderSettings } = useSettings();
  const [filteredProviders, setFilteredProviders] = useState<IProviderConfig[]>([]);
  const [categoryEnabled, setCategoryEnabled] = useState<boolean>(false);
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [serviceStatus, setServiceStatus] = useState<OllamaServiceStatus>({
    isRunning: false,
    lastChecked: new Date(),
  });
  const [isInstallingModel, setIsInstallingModel] = useState<string | null>(null);
  const [installProgress, setInstallProgress] = useState<{
    model: string;
    progress: number;
    status: string;
  } | null>(null);
  const [manualInstall, setManualInstall] = useState<ManualInstallState>({
    isOpen: false,
    modelString: '',
  });

  // Effect to filter and sort providers
  useEffect(() => {
    const newFilteredProviders = Object.entries(providers || {})
      .filter(([key]) => [...LOCAL_PROVIDERS, 'OpenAILike'].includes(key))
      .map(([key, value]) => {
        const provider = value as IProviderConfig;
        const envKey = providerBaseUrlEnvKeys[key]?.baseUrlKey;

        // Get environment URL safely
        const envUrl = envKey ? (import.meta.env[envKey] as string | undefined) : undefined;

        console.log(`Checking env URL for ${key}:`, {
          envKey,
          envUrl,
          currentBaseUrl: provider.settings.baseUrl,
        });

        // If there's an environment URL and no base URL set, update it
        if (envUrl && !provider.settings.baseUrl) {
          console.log(`Setting base URL for ${key} from env:`, envUrl);
          updateProviderSettings(key, {
            ...provider.settings,
            baseUrl: envUrl,
          });
        }

        return {
          name: key,
          settings: {
            ...provider.settings,
            baseUrl: provider.settings.baseUrl || envUrl,
          },
          staticModels: provider.staticModels || [],
          getDynamicModels: provider.getDynamicModels,
          getApiKeyLink: provider.getApiKeyLink,
          labelForGetApiKey: provider.labelForGetApiKey,
          icon: provider.icon,
        } as IProviderConfig;
      });

    // Custom sort function to ensure LMStudio appears before OpenAILike
    const sorted = newFilteredProviders.sort((a, b) => {
      if (a.name === 'LMStudio') {
        return -1;
      }

      if (b.name === 'LMStudio') {
        return 1;
      }

      if (a.name === 'OpenAILike') {
        return 1;
      }

      if (b.name === 'OpenAILike') {
        return -1;
      }

      return a.name.localeCompare(b.name);
    });
    setFilteredProviders(sorted);
  }, [providers, updateProviderSettings]);

  // Helper function to safely get environment URL
  const getEnvUrl = (provider: IProviderConfig): string | undefined => {
    const envKey = providerBaseUrlEnvKeys[provider.name]?.baseUrlKey;
    return envKey ? (import.meta.env[envKey] as string | undefined) : undefined;
  };

  // Add effect to update category toggle state based on provider states
  useEffect(() => {
    const newCategoryState = filteredProviders.every((p) => p.settings.enabled);
    setCategoryEnabled(newCategoryState);
  }, [filteredProviders]);

  // Fetch Ollama models when enabled
  useEffect(() => {
    const ollamaProvider = filteredProviders.find((p) => p.name === 'Ollama');

    if (ollamaProvider?.settings.enabled) {
      fetchOllamaModels();
    }
  }, [filteredProviders]);

  const fetchOllamaModels = async () => {
    try {
      setIsLoadingModels(true);

      const response = await fetch('http://127.0.0.1:11434/api/tags');
      const data = (await response.json()) as { models: OllamaModel[] };

      setOllamaModels(
        data.models.map((model) => ({
          ...model,
          status: 'idle' as const,
        })),
      );
    } catch (error) {
      console.error('Error fetching Ollama models:', error);
    } finally {
      setIsLoadingModels(false);
    }
  };

  const updateOllamaModel = async (modelName: string): Promise<{ success: boolean; newDigest?: string }> => {
    try {
      const response = await fetch(`${OLLAMA_API_URL}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelName }),
      });

      if (!response.ok) {
        throw new Error(`Failed to update ${modelName}`);
      }

      const reader = response.body?.getReader();

      if (!reader) {
        throw new Error('No response reader available');
      }

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        const text = new TextDecoder().decode(value);
        const lines = text.split('\n').filter(Boolean);

        for (const line of lines) {
          const rawData = JSON.parse(line);

          if (!isOllamaPullResponse(rawData)) {
            console.error('Invalid response format:', rawData);
            continue;
          }

          setOllamaModels((current) =>
            current.map((m) =>
              m.name === modelName
                ? {
                    ...m,
                    progress: {
                      current: rawData.completed || 0,
                      total: rawData.total || 0,
                      status: rawData.status,
                    },
                    newDigest: rawData.digest,
                  }
                : m,
            ),
          );
        }
      }

      const updatedResponse = await fetch('http://127.0.0.1:11434/api/tags');
      const updatedData = (await updatedResponse.json()) as { models: OllamaModel[] };
      const updatedModel = updatedData.models.find((m) => m.name === modelName);

      return { success: true, newDigest: updatedModel?.digest };
    } catch (error) {
      console.error(`Error updating ${modelName}:`, error);
      return { success: false };
    }
  };

  const handleToggleCategory = useCallback(
    (enabled: boolean) => {
      setCategoryEnabled(enabled);
      filteredProviders.forEach((provider) => {
        updateProviderSettings(provider.name, { ...provider.settings, enabled });
      });
      success(enabled ? 'All local providers enabled' : 'All local providers disabled');
    },
    [filteredProviders, updateProviderSettings, success],
  );

  const handleToggleProvider = (provider: IProviderConfig, enabled: boolean) => {
    updateProviderSettings(provider.name, { ...provider.settings, enabled });

    if (enabled) {
      logStore.logProvider(`Provider ${provider.name} enabled`, { provider: provider.name });
      success(`${provider.name} enabled`);
    } else {
      logStore.logProvider(`Provider ${provider.name} disabled`, { provider: provider.name });
      success(`${provider.name} disabled`);
    }
  };

  const handleUpdateBaseUrl = (provider: IProviderConfig, baseUrl: string) => {
    let newBaseUrl: string | undefined = baseUrl;

    if (newBaseUrl && newBaseUrl.trim().length === 0) {
      newBaseUrl = undefined;
    }

    updateProviderSettings(provider.name, { ...provider.settings, baseUrl: newBaseUrl });
    logStore.logProvider(`Base URL updated for ${provider.name}`, {
      provider: provider.name,
      baseUrl: newBaseUrl,
    });
    success(`${provider.name} base URL updated`);
    setEditingProvider(null);
  };

  const handleUpdateOllamaModel = async (modelName: string) => {
    setOllamaModels((current) => current.map((m) => (m.name === modelName ? { ...m, status: 'updating' } : m)));

    const { success: updateSuccess, newDigest } = await updateOllamaModel(modelName);

    setOllamaModels((current) =>
      current.map((m) =>
        m.name === modelName
          ? {
              ...m,
              status: updateSuccess ? 'updated' : 'error',
              error: updateSuccess ? undefined : 'Update failed',
              newDigest,
            }
          : m,
      ),
    );

    if (updateSuccess) {
      success(`Updated ${modelName}`);
    } else {
      error(`Failed to update ${modelName}`);
    }
  };

  const handleDeleteOllamaModel = async (modelName: string) => {
    try {
      const response = await fetch(`${OLLAMA_API_URL}/api/delete`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: modelName }),
      });

      if (!response.ok) {
        throw new Error(`Failed to delete ${modelName}`);
      }

      setOllamaModels((current) => current.filter((m) => m.name !== modelName));
      success(`Deleted ${modelName}`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      console.error(`Error deleting ${modelName}:`, errorMessage);
      error(`Failed to delete ${modelName}`);
    }
  };

  // Health check function
  const checkOllamaHealth = async () => {
    try {
      // Use the root endpoint instead of /api/health
      const response = await fetch(OLLAMA_API_URL);
      const text = await response.text();
      const isRunning = text.includes('Ollama is running');

      setServiceStatus({
        isRunning,
        lastChecked: new Date(),
      });

      if (isRunning) {
        // If Ollama is running, fetch models
        fetchOllamaModels();
      }

      return isRunning;
    } catch (error) {
      console.error('Health check error:', error);
      setServiceStatus({
        isRunning: false,
        lastChecked: new Date(),
        error: error instanceof Error ? error.message : 'Failed to connect to Ollama service',
      });

      return false;
    }
  };

  // Update manual installation function
  const handleManualInstall = async (modelString: string) => {
    try {
      setIsInstallingModel(modelString);
      setInstallProgress({ model: modelString, progress: 0, status: 'Starting download...' });
      setManualInstall((prev) => ({ ...prev, isOpen: false }));

      const response = await fetch(`${OLLAMA_API_URL}/api/pull`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: modelString }),
      });

      if (!response.ok) {
        throw new Error(`Failed to install ${modelString}`);
      }

      const reader = response.body?.getReader();

      if (!reader) {
        throw new Error('No response reader available');
      }

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        const text = new TextDecoder().decode(value);
        const lines = text.split('\n').filter(Boolean);

        for (const line of lines) {
          const rawData = JSON.parse(line);

          if (!isOllamaPullResponse(rawData)) {
            console.error('Invalid response format:', rawData);
            continue;
          }

          setInstallProgress({
            model: modelString,
            progress: rawData.completed && rawData.total ? (rawData.completed / rawData.total) * 100 : 0,
            status: rawData.status,
          });
        }
      }

      success(`Successfully installed ${modelString}`);
      await fetchOllamaModels();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      console.error(`Error installing ${modelString}:`, errorMessage);
      error(`Failed to install ${modelString}`);
    } finally {
      setIsInstallingModel(null);
      setInstallProgress(null);
    }
  };

  // Add health check effect
  useEffect(() => {
    const checkHealth = async () => {
      const isHealthy = await checkOllamaHealth();

      if (!isHealthy) {
        error('Ollama service is not running. Please start the Ollama service.');
      }
    };

    checkHealth();

    const interval = setInterval(checkHealth, 50000);

    // Check every 30 seconds
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6">
      {/* Service Status Indicator - Move to top */}
      <div
        className={classNames(
          'flex items-center gap-2 p-2 rounded-lg',
          serviceStatus.isRunning ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500',
        )}
      >
        <div className={classNames('w-2 h-2 rounded-full', serviceStatus.isRunning ? 'bg-green-500' : 'bg-red-500')} />
        <span className="text-sm">
          {serviceStatus.isRunning ? 'Ollama service is running' : 'Ollama service is not running'}
        </span>
        <span className="text-xs text-bolt-elements-textSecondary ml-2">
          Last checked: {serviceStatus.lastChecked.toLocaleTimeString()}
        </span>
      </div>

      <motion.div
        className="space-y-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="flex items-center justify-between gap-4 mt-8 mb-4">
          <div className="flex items-center gap-2">
            <div
              className={classNames(
                'w-8 h-8 flex items-center justify-center rounded-lg',
                'bg-bolt-elements-background-depth-3',
                'text-purple-500',
              )}
            >
              <BiChip className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-md font-medium text-bolt-elements-textPrimary">Local Providers</h4>
              <p className="text-sm text-bolt-elements-textSecondary">
                Configure and update local AI models on your machine
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-bolt-elements-textSecondary">Enable All Local</span>
            <Switch checked={categoryEnabled} onCheckedChange={handleToggleCategory} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {filteredProviders.map((provider, index) => (
            <motion.div
              key={provider.name}
              className={classNames(
                settingsStyles.card,
                'bg-bolt-elements-background-depth-2',
                'hover:bg-bolt-elements-background-depth-3',
                'transition-all duration-200',
                'relative overflow-hidden group',
                'flex flex-col',

                // Make Ollama span 2 rows
                provider.name === 'Ollama' ? 'row-span-2' : '',

                // Place Ollama in the second column
                provider.name === 'Ollama' ? 'col-start-2' : 'col-start-1',
              )}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              whileHover={{ scale: 1.02 }}
            >
              <div className="absolute top-0 right-0 p-2 flex gap-1">
                <motion.span
                  className="px-2 py-0.5 text-xs rounded-full bg-green-500/10 text-green-500 font-medium"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  Local
                </motion.span>
                {URL_CONFIGURABLE_PROVIDERS.includes(provider.name) && (
                  <motion.span
                    className="px-2 py-0.5 text-xs rounded-full bg-purple-500/10 text-purple-500 font-medium"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    Configurable
                  </motion.span>
                )}
              </div>

              <div className="flex items-start gap-4 p-4">
                <motion.div
                  className={classNames(
                    'w-10 h-10 flex items-center justify-center rounded-xl',
                    'bg-bolt-elements-background-depth-3 group-hover:bg-bolt-elements-background-depth-4',
                    'transition-all duration-200',
                    provider.settings.enabled ? 'text-purple-500' : 'text-bolt-elements-textSecondary',
                  )}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                >
                  <div className={classNames('w-6 h-6', 'transition-transform duration-200', 'group-hover:rotate-12')}>
                    {React.createElement(PROVIDER_ICONS[provider.name as ProviderName] || BsRobot, {
                      className: 'w-full h-full',
                      'aria-label': `${provider.name} logo`,
                    })}
                  </div>
                </motion.div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-4 mb-2">
                    <div>
                      <h4 className="text-sm font-medium text-bolt-elements-textPrimary group-hover:text-purple-500 transition-colors">
                        {provider.name}
                      </h4>
                      <p className="text-xs text-bolt-elements-textSecondary mt-0.5">
                        {PROVIDER_DESCRIPTIONS[provider.name as ProviderName]}
                      </p>
                    </div>
                    <Switch
                      checked={provider.settings.enabled}
                      onCheckedChange={(checked) => handleToggleProvider(provider, checked)}
                    />
                  </div>

                  {provider.settings.enabled && URL_CONFIGURABLE_PROVIDERS.includes(provider.name) && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <div className="flex items-center gap-2 mt-4">
                        {editingProvider === provider.name ? (
                          <input
                            type="text"
                            defaultValue={provider.settings.baseUrl}
                            placeholder={`Enter ${provider.name} base URL`}
                            className={classNames(
                              'flex-1 px-3 py-1.5 rounded-lg text-sm',
                              'bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor',
                              'text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary',
                              'focus:outline-none focus:ring-2 focus:ring-purple-500/30',
                              'transition-all duration-200',
                            )}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleUpdateBaseUrl(provider, e.currentTarget.value);
                              } else if (e.key === 'Escape') {
                                setEditingProvider(null);
                              }
                            }}
                            onBlur={(e) => handleUpdateBaseUrl(provider, e.target.value)}
                            autoFocus
                          />
                        ) : (
                          <div
                            className="flex-1 px-3 py-1.5 rounded-lg text-sm cursor-pointer group/url"
                            onClick={() => setEditingProvider(provider.name)}
                          >
                            <div className="flex items-center gap-2 text-bolt-elements-textSecondary">
                              <div className="i-ph:link text-sm" />
                              <span className="group-hover/url:text-purple-500 transition-colors">
                                {provider.settings.baseUrl || 'Click to set base URL'}
                              </span>
                            </div>
                          </div>
                        )}

                        {providerBaseUrlEnvKeys[provider.name]?.baseUrlKey && (
                          <div className="mt-2 text-xs">
                            <div className="flex items-center gap-1">
                              <div
                                className={
                                  getEnvUrl(provider)
                                    ? 'i-ph:check-circle text-green-500'
                                    : 'i-ph:warning-circle text-yellow-500'
                                }
                              />
                              <span className={getEnvUrl(provider) ? 'text-green-500' : 'text-yellow-500'}>
                                {getEnvUrl(provider)
                                  ? 'Environment URL set in .env.local'
                                  : 'Environment URL not set in .env.local'}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </div>
              </div>

              {provider.name === 'Ollama' && provider.settings.enabled && (
                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="i-ph:cube-duotone text-purple-500" />
                      <span className="text-sm font-medium text-bolt-elements-textPrimary">Installed Models</span>
                    </div>
                    {isLoadingModels ? (
                      <div className="flex items-center gap-2 text-sm text-bolt-elements-textSecondary">
                        <div className="i-ph:spinner-gap-bold animate-spin w-4 h-4" />
                        Loading models...
                      </div>
                    ) : (
                      <span className="text-sm text-bolt-elements-textSecondary">
                        {ollamaModels.length} models available
                      </span>
                    )}
                  </div>

                  <div className="space-y-2">
                    {ollamaModels.map((model) => (
                      <div
                        key={model.name}
                        className="flex items-center justify-between p-2 rounded-lg bg-bolt-elements-background-depth-3"
                      >
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-bolt-elements-textPrimary">{model.name}</span>
                            {model.status === 'updating' && (
                              <div className="i-ph:spinner-gap-bold animate-spin w-4 h-4 text-purple-500" />
                            )}
                            {model.status === 'updated' && <div className="i-ph:check-circle text-green-500" />}
                            {model.status === 'error' && <div className="i-ph:x-circle text-red-500" />}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-bolt-elements-textSecondary">
                            <span>Version: {model.digest.substring(0, 7)}</span>
                            {model.status === 'updated' && model.newDigest && (
                              <>
                                <div className="i-ph:arrow-right w-3 h-3" />
                                <span className="text-green-500">{model.newDigest.substring(0, 7)}</span>
                              </>
                            )}
                            {model.progress && (
                              <span className="ml-2">
                                {model.progress.status}{' '}
                                {model.progress.total > 0 && (
                                  <>({Math.round((model.progress.current / model.progress.total) * 100)}%)</>
                                )}
                              </span>
                            )}
                            {model.details && (
                              <span className="ml-2">
                                ({model.details.parameter_size}, {model.details.quantization_level})
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <motion.button
                            onClick={() => handleUpdateOllamaModel(model.name)}
                            disabled={model.status === 'updating'}
                            className={classNames(
                              settingsStyles.button.base,
                              settingsStyles.button.secondary,
                              'hover:bg-purple-500/10 hover:text-purple-500',
                            )}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                          >
                            <div className="i-ph:arrows-clockwise" />
                            Update
                          </motion.button>
                          <motion.button
                            onClick={() => {
                              if (window.confirm(`Are you sure you want to delete ${model.name}?`)) {
                                handleDeleteOllamaModel(model.name);
                              }
                            }}
                            disabled={model.status === 'updating'}
                            className={classNames(
                              settingsStyles.button.base,
                              settingsStyles.button.secondary,
                              'hover:bg-red-500/10 hover:text-red-500',
                            )}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                          >
                            <div className="i-ph:trash" />
                            Delete
                          </motion.button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <motion.div
                className="absolute inset-0 border-2 border-purple-500/0 rounded-lg pointer-events-none"
                animate={{
                  borderColor: provider.settings.enabled ? 'rgba(168, 85, 247, 0.2)' : 'rgba(168, 85, 247, 0)',
                  scale: provider.settings.enabled ? 1 : 0.98,
                }}
                transition={{ duration: 0.2 }}
              />
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Manual Installation Section */}
      {serviceStatus.isRunning && (
        <div className="mt-8 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-medium text-bolt-elements-textPrimary">Install New Model</h3>
              <p className="text-sm text-bolt-elements-textSecondary">
                Enter the model name exactly as shown (e.g., deepseek-r1:1.5b)
              </p>
            </div>
          </div>

          {/* Model Information Section */}
          <div className="p-4 rounded-lg bg-bolt-elements-background-depth-2 space-y-3">
            <div className="flex items-center gap-2 text-bolt-elements-textPrimary">
              <div className="i-ph:info text-purple-500" />
              <span className="font-medium">Where to find models?</span>
            </div>
            <div className="space-y-2 text-sm text-bolt-elements-textSecondary">
              <p>
                Browse available models at{' '}
                <a
                  href="https://ollama.com/library"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-purple-500 hover:underline"
                >
                  ollama.com/library
                </a>
              </p>
              <div className="space-y-1">
                <p className="font-medium text-bolt-elements-textPrimary">Popular models:</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>deepseek-r1:1.5b - DeepSeek's reasoning model</li>
                  <li>llama3:8b - Meta's Llama 3 (8B parameters)</li>
                  <li>mistral:7b - Mistral's 7B model</li>
                  <li>gemma:2b - Google's Gemma model</li>
                  <li>qwen2:7b - Alibaba's Qwen2 model</li>
                </ul>
              </div>
              <p className="mt-2">
                <span className="text-yellow-500">Note:</span> Copy the exact model name including the tag (e.g.,
                'deepseek-r1:1.5b') from the library to ensure successful installation.
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="flex-1">
              <input
                type="text"
                className="w-full px-3 py-2 rounded-md bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor text-bolt-elements-textPrimary"
                placeholder="deepseek-r1:1.5b"
                value={manualInstall.modelString}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setManualInstall((prev) => ({ ...prev, modelString: e.target.value }))
                }
              />
            </div>
            <motion.button
              onClick={() => handleManualInstall(manualInstall.modelString)}
              disabled={!manualInstall.modelString || !!isInstallingModel}
              className={classNames(
                settingsStyles.button.base,
                settingsStyles.button.primary,
                'hover:bg-purple-500/10 hover:text-purple-500',
                'min-w-[120px] justify-center',
              )}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {isInstallingModel ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="i-ph:spinner-gap-bold animate-spin" />
                  Installing...
                </div>
              ) : (
                <>
                  <div className="i-ph:download" />
                  Install Model
                </>
              )}
            </motion.button>
            {isInstallingModel && (
              <motion.button
                onClick={() => {
                  setIsInstallingModel(null);
                  setInstallProgress(null);
                  error('Installation cancelled');
                }}
                className={classNames(
                  settingsStyles.button.base,
                  settingsStyles.button.secondary,
                  'hover:bg-red-500/10 hover:text-red-500',
                  'min-w-[100px] justify-center',
                )}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <div className="i-ph:x" />
                Cancel
              </motion.button>
            )}
          </div>

          {installProgress && (
            <div className="mt-2 space-y-2">
              <div className="flex items-center justify-between text-sm text-bolt-elements-textSecondary">
                <span>{installProgress.status}</span>
                <span>{Math.round(installProgress.progress)}%</span>
              </div>
              <div className="w-full h-2 bg-bolt-elements-background-depth-3 rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-500 transition-all duration-200"
                  style={{ width: `${installProgress.progress}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default LocalProvidersTab;
