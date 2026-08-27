import { motion } from 'framer-motion';
import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { IconType } from 'react-icons';
import { BiCodeBlock, BiChip } from 'react-icons/bi';
import { BsRobot, BsCloud } from 'react-icons/bs';
import { FaCloud, FaBrain } from 'react-icons/fa';
import { SiAmazon, SiGoogle, SiGithub, SiHuggingface, SiPerplexity, SiOpenai } from 'react-icons/si';
import { TbBrain, TbCloudComputing } from 'react-icons/tb';
import { toast } from 'react-toastify';
import { Switch } from '~/components/ui/Switch';
import { useSettings } from '~/lib/hooks/useSettings';
import {
  formatSettingsStatusSurfacesCopy,
  getSettingsStatusSurfacesCopy,
  type SettingsStatusSurfacesKey,
} from '~/lib/i18n/catalogs/settings-status-surfaces';
import { logStore } from '~/lib/stores/logs';
import { URL_CONFIGURABLE_PROVIDERS } from '~/lib/stores/settings';
import type { IProviderConfig } from '~/types/model';
import { classNames } from '~/utils/classNames';
import { providerBaseUrlEnvKeys } from '~/utils/constants';

// Add type for provider names to ensure type safety
type ProviderName =
  | 'AmazonBedrock'
  | 'Anthropic'
  | 'Cohere'
  | 'Deepseek'
  | 'Github'
  | 'Google'
  | 'Groq'
  | 'HuggingFace'
  | 'Hyperbolic'
  | 'Mistral'
  | 'OpenAI'
  | 'OpenRouter'
  | 'Perplexity'
  | 'Together'
  | 'XAI';

// Update the PROVIDER_ICONS type to use the ProviderName type
const PROVIDER_ICONS: Record<ProviderName, IconType> = {
  AmazonBedrock: SiAmazon,
  Anthropic: FaBrain,
  Cohere: BiChip,
  Deepseek: BiCodeBlock,
  Github: SiGithub,
  Google: SiGoogle,
  Groq: BsCloud,
  HuggingFace: SiHuggingface,
  Hyperbolic: TbCloudComputing,
  Mistral: TbBrain,
  OpenAI: SiOpenai,
  OpenRouter: FaCloud,
  Perplexity: SiPerplexity,
  Together: BsCloud,
  XAI: BsRobot,
};

const PROVIDER_DESCRIPTION_KEYS: Partial<Record<ProviderName, SettingsStatusSurfacesKey>> = {
  Anthropic: 'settingsStatus.cloud.description.anthropic',
  Github: 'settingsStatus.cloud.description.github',
  OpenAI: 'settingsStatus.cloud.description.openai',
};

const CloudProvidersTab = () => {
  const { i18n } = useTranslation();
  const copy = getSettingsStatusSurfacesCopy(i18n.resolvedLanguage ?? i18n.language);
  const settings = useSettings();
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [filteredProviders, setFilteredProviders] = useState<IProviderConfig[]>([]);
  const [categoryEnabled, setCategoryEnabled] = useState<boolean>(false);
  const [providersState, setProvidersState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [reloadToken, setReloadToken] = useState(0);

  // Load and filter providers
  useEffect(() => {
    setProvidersState('loading');

    try {
      const newFilteredProviders = Object.entries(settings.providers || {})
        .filter(([key]) => !['Ollama', 'LMStudio', 'OpenAILike'].includes(key))
        .map(([key, value]) => ({
          name: key,
          settings: value.settings,
          staticModels: value.staticModels || [],
          getDynamicModels: value.getDynamicModels,
          getApiKeyLink: value.getApiKeyLink,
          labelForGetApiKey: value.labelForGetApiKey,
          icon: value.icon,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      setFilteredProviders(newFilteredProviders);
      setCategoryEnabled(
        newFilteredProviders.length > 0 && newFilteredProviders.every((provider) => provider.settings.enabled),
      );
      setProvidersState('ready');
    } catch (error) {
      console.error('cloudProviders.load', error);
      setFilteredProviders([]);
      setCategoryEnabled(false);
      setProvidersState('error');
    }
  }, [reloadToken, settings.providers]);

  const handleToggleCategory = useCallback(
    (enabled: boolean) => {
      // Update all providers
      filteredProviders.forEach((provider) => {
        settings.updateProviderSettings(provider.name, { ...provider.settings, enabled });
      });

      setCategoryEnabled(enabled);
      toast.success(copy[enabled ? 'settingsStatus.cloud.allEnabled' : 'settingsStatus.cloud.allDisabled']);
    },
    [copy, filteredProviders, settings],
  );

  const handleToggleProvider = useCallback(
    (provider: IProviderConfig, enabled: boolean) => {
      // Update the provider settings in the store
      settings.updateProviderSettings(provider.name, { ...provider.settings, enabled });

      if (enabled) {
        logStore.logProvider('provider.toggle', { provider: provider.name, enabled });
        toast.success(
          formatSettingsStatusSurfacesCopy(copy['settingsStatus.cloud.enabled'], { provider: provider.name }),
        );
      } else {
        logStore.logProvider('provider.toggle', { provider: provider.name, enabled });
        toast.success(
          formatSettingsStatusSurfacesCopy(copy['settingsStatus.cloud.disabled'], { provider: provider.name }),
        );
      }
    },
    [copy, settings],
  );

  const handleUpdateBaseUrl = useCallback(
    (provider: IProviderConfig, baseUrl: string) => {
      const newBaseUrl: string | undefined = baseUrl.trim() || undefined;

      // Update the provider settings in the store
      settings.updateProviderSettings(provider.name, { ...provider.settings, baseUrl: newBaseUrl });

      logStore.logProvider('provider.baseUrl.updated', {
        provider: provider.name,
        baseUrl: newBaseUrl,
      });
      toast.success(
        formatSettingsStatusSurfacesCopy(copy['settingsStatus.cloud.baseUrlUpdated'], { provider: provider.name }),
      );
      setEditingProvider(null);
    },
    [copy, settings],
  );

  return (
    <div className="space-y-6">
      <motion.div
        className="space-y-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="mt-8 mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-2">
            <div
              className={classNames(
                'w-8 h-8 flex items-center justify-center rounded-lg',
                'bg-bolt-elements-background-depth-3',
                'text-[var(--vc-ide-accent-action)]',
              )}
            >
              <TbCloudComputing className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h4 className="text-md break-words font-medium text-bolt-elements-textPrimary">
                {copy['settingsStatus.cloud.title']}
              </h4>
              <p className="break-words text-sm text-bolt-elements-textSecondary">
                {copy['settingsStatus.cloud.description']}
              </p>
            </div>
          </div>

          <label className="flex min-h-11 items-center justify-between gap-3 sm:justify-end">
            <span className="break-words text-sm text-bolt-elements-textSecondary">
              {copy['settingsStatus.cloud.enableAll']}
            </span>
            <Switch
              aria-label={copy['settingsStatus.cloud.enableAll']}
              checked={categoryEnabled}
              disabled={providersState !== 'ready' || filteredProviders.length === 0}
              onCheckedChange={handleToggleCategory}
            />
          </label>
        </div>

        {providersState === 'loading' && (
          <div
            className="space-y-3 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4"
            role="status"
            aria-live="polite"
          >
            <span className="sr-only">{copy['settingsStatus.cloud.loading']}</span>
            {[0, 1].map((item) => (
              <div
                key={item}
                className="flex animate-pulse items-center gap-3 motion-reduce:animate-none"
                aria-hidden="true"
              >
                <div className="h-11 w-11 rounded-xl bg-bolt-elements-background-depth-3" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-3 w-1/3 rounded bg-bolt-elements-background-depth-3" />
                  <div className="h-3 w-4/5 rounded bg-bolt-elements-background-depth-3" />
                </div>
              </div>
            ))}
          </div>
        )}

        {providersState === 'error' && (
          <div
            className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-bolt-elements-textPrimary"
            role="alert"
          >
            <h5 className="break-words font-medium">{copy['settingsStatus.cloud.loadErrorTitle']}</h5>
            <p className="mt-1 break-words text-bolt-elements-textSecondary">
              {copy['settingsStatus.cloud.loadErrorDescription']}
            </p>
            <button
              type="button"
              className="mt-3 min-h-11 rounded-lg border border-bolt-elements-borderColor px-4 py-2 text-sm font-medium whitespace-normal text-bolt-elements-textPrimary transition-colors hover:bg-bolt-elements-background-depth-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-focus-ring)]"
              onClick={() => setReloadToken((token) => token + 1)}
            >
              {copy['settingsStatus.cloud.retry']}
            </button>
          </div>
        )}

        {providersState === 'ready' && filteredProviders.length === 0 && (
          <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 text-center">
            <h5 className="break-words text-sm font-medium text-bolt-elements-textPrimary">
              {copy['settingsStatus.cloud.emptyTitle']}
            </h5>
            <p className="mt-1 break-words text-sm text-bolt-elements-textSecondary">
              {copy['settingsStatus.cloud.emptyDescription']}
            </p>
          </div>
        )}

        {providersState === 'ready' && filteredProviders.length > 0 && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {filteredProviders.map((provider, index) => (
              <motion.div
                key={provider.name}
                className={classNames(
                  'rounded-lg border bg-bolt-elements-background text-bolt-elements-textPrimary shadow-sm',
                  'bg-bolt-elements-background-depth-2',
                  'hover:bg-bolt-elements-background-depth-3',
                  'transition-all duration-200 motion-reduce:transition-none',
                  'relative overflow-hidden group',
                  'flex flex-col',
                )}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                whileHover={{ scale: 1.02 }}
              >
                <div className="absolute top-0 right-0 p-2 flex gap-1">
                  {URL_CONFIGURABLE_PROVIDERS.includes(provider.name) && (
                    <motion.span
                      className="px-2 py-0.5 text-xs rounded-full bg-[color-mix(in_srgb,var(--vc-ide-accent-action)_10%,transparent)] text-[var(--vc-ide-accent-action)] font-medium"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      {copy['settingsStatus.cloud.configurable']}
                    </motion.span>
                  )}
                </div>

                <div className="flex items-start gap-4 p-4">
                  <motion.div
                    className={classNames(
                      'w-10 h-10 flex items-center justify-center rounded-xl',
                      'bg-bolt-elements-background-depth-3 group-hover:bg-bolt-elements-background-depth-4',
                      'transition-all duration-200',
                      provider.settings.enabled
                        ? 'text-[var(--vc-ide-accent-action)]'
                        : 'text-bolt-elements-textSecondary',
                    )}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                  >
                    <div
                      className={classNames('w-6 h-6', 'transition-transform duration-200', 'group-hover:rotate-12')}
                    >
                      {React.createElement(PROVIDER_ICONS[provider.name as ProviderName] || BsRobot, {
                        className: 'w-full h-full',
                        'aria-label': formatSettingsStatusSurfacesCopy(copy['settingsStatus.cloud.logo'], {
                          provider: provider.name,
                        }),
                      })}
                    </div>
                  </motion.div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-4 mb-2">
                      <div className="min-w-0">
                        <h4 className="break-words text-sm font-medium text-bolt-elements-textPrimary transition-colors group-hover:text-[var(--vc-ide-accent-action)]">
                          {provider.name}
                        </h4>
                        <p className="mt-0.5 break-words text-xs text-bolt-elements-textSecondary">
                          {
                            copy[
                              PROVIDER_DESCRIPTION_KEYS[provider.name as ProviderName] ??
                                (URL_CONFIGURABLE_PROVIDERS.includes(provider.name)
                                  ? 'settingsStatus.cloud.description.custom'
                                  : 'settingsStatus.cloud.description.standard')
                            ]
                          }
                        </p>
                      </div>
                      <div className="flex min-h-11 shrink-0 items-center">
                        <Switch
                          aria-label={formatSettingsStatusSurfacesCopy(copy['settingsStatus.cloud.toggle'], {
                            provider: provider.name,
                          })}
                          checked={provider.settings.enabled}
                          onCheckedChange={(checked) => handleToggleProvider(provider, checked)}
                        />
                      </div>
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
                              aria-label={formatSettingsStatusSurfacesCopy(copy['settingsStatus.cloud.baseUrlInput'], {
                                provider: provider.name,
                              })}
                              defaultValue={provider.settings.baseUrl}
                              placeholder={formatSettingsStatusSurfacesCopy(
                                copy['settingsStatus.cloud.baseUrlPlaceholder'],
                                { provider: provider.name },
                              )}
                              className={classNames(
                                'min-h-11 min-w-0 flex-1 rounded-lg px-3 py-2 text-sm',
                                'bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor',
                                'text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary',
                                'focus:outline-none focus:ring-2 focus:ring-[var(--vc-ide-focus-ring)]',
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
                            <button
                              type="button"
                              aria-label={formatSettingsStatusSurfacesCopy(copy['settingsStatus.cloud.editBaseUrl'], {
                                provider: provider.name,
                              })}
                              className="group/url min-h-11 min-w-0 flex-1 cursor-pointer rounded-lg px-3 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-focus-ring)]"
                              onClick={() => setEditingProvider(provider.name)}
                            >
                              <div className="flex items-center gap-2 text-bolt-elements-textSecondary">
                                <div className="i-ph:link text-sm" aria-hidden />
                                <span className="break-all transition-colors group-hover/url:text-[var(--vc-ide-accent-action)]">
                                  {provider.settings.baseUrl || copy['settingsStatus.cloud.setBaseUrl']}
                                </span>
                              </div>
                            </button>
                          )}
                        </div>

                        {providerBaseUrlEnvKeys[provider.name]?.baseUrlKey && (
                          <div className="mt-2 text-xs text-green-600 dark:text-green-400">
                            <div className="flex items-center gap-1">
                              <div className="i-ph:info" aria-hidden="true" />
                              <span className="break-words">{copy['settingsStatus.cloud.environmentUrl']}</span>
                            </div>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </div>
                </div>

                <motion.div
                  className="absolute inset-0 border-2 border-transparent rounded-lg pointer-events-none"
                  animate={{
                    borderColor: provider.settings.enabled
                      ? 'color-mix(in srgb, var(--vc-ide-accent-action) 20%, transparent)'
                      : 'transparent',
                    scale: provider.settings.enabled ? 1 : 0.98,
                  }}
                  transition={{ duration: 0.2 }}
                />
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default CloudProvidersTab;
