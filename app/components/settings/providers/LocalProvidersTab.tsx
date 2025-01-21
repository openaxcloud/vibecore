import React, { useEffect, useState, useCallback } from 'react';
import { Switch } from '~/components/ui/Switch';
import { useSettings } from '~/lib/hooks/useSettings';
import { LOCAL_PROVIDERS, URL_CONFIGURABLE_PROVIDERS } from '~/lib/stores/settings';
import type { IProviderConfig } from '~/types/model';
import { logStore } from '~/lib/stores/logs';
import { motion } from 'framer-motion';
import { classNames } from '~/utils/classNames';
import { settingsStyles } from '~/components/settings/settings.styles';
import { toast } from 'react-toastify';
import { BsBox, BsCodeSquare, BsRobot } from 'react-icons/bs';
import type { IconType } from 'react-icons';
import OllamaModelUpdater from './OllamaModelUpdater';
import { DialogRoot, Dialog } from '~/components/ui/Dialog';
import { BiChip } from 'react-icons/bi';
import { TbBrandOpenai } from 'react-icons/tb';
import { providerBaseUrlEnvKeys } from '~/utils/constants';

// Add type for provider names to ensure type safety
type ProviderName = 'Ollama' | 'LMStudio' | 'OpenAILike';

// Update the PROVIDER_ICONS type to use the ProviderName type
const PROVIDER_ICONS: Record<ProviderName, IconType> = {
  Ollama: BsBox,
  LMStudio: BsCodeSquare,
  OpenAILike: TbBrandOpenai,
};

// Update PROVIDER_DESCRIPTIONS to use the same type
const PROVIDER_DESCRIPTIONS: Record<ProviderName, string> = {
  Ollama: 'Run open-source models locally on your machine',
  LMStudio: 'Local model inference with LM Studio',
  OpenAILike: 'Connect to OpenAI-compatible API endpoints',
};

const LocalProvidersTab = () => {
  const settings = useSettings();
  const [filteredProviders, setFilteredProviders] = useState<IProviderConfig[]>([]);
  const [categoryEnabled, setCategoryEnabled] = useState<boolean>(false);
  const [showOllamaUpdater, setShowOllamaUpdater] = useState(false);
  const [editingProvider, setEditingProvider] = useState<string | null>(null);

  // Effect to filter and sort providers
  useEffect(() => {
    const newFilteredProviders = Object.entries(settings.providers || {})
      .filter(([key]) => [...LOCAL_PROVIDERS, 'OpenAILike'].includes(key))
      .map(([key, value]) => {
        const provider = value as IProviderConfig;
        return {
          name: key,
          settings: provider.settings,
          staticModels: provider.staticModels || [],
          getDynamicModels: provider.getDynamicModels,
          getApiKeyLink: provider.getApiKeyLink,
          labelForGetApiKey: provider.labelForGetApiKey,
          icon: provider.icon,
        } as IProviderConfig;
      });

    const sorted = newFilteredProviders.sort((a, b) => a.name.localeCompare(b.name));
    setFilteredProviders(sorted);
  }, [settings.providers]);

  // Add effect to update category toggle state based on provider states
  useEffect(() => {
    const newCategoryState = filteredProviders.every((p) => p.settings.enabled);
    setCategoryEnabled(newCategoryState);
  }, [filteredProviders]);

  const handleToggleCategory = useCallback(
    (enabled: boolean) => {
      setCategoryEnabled(enabled);
      filteredProviders.forEach((provider) => {
        settings.updateProviderSettings(provider.name, { ...provider.settings, enabled });
      });
      toast.success(enabled ? 'All local providers enabled' : 'All local providers disabled');
    },
    [filteredProviders, settings],
  );

  const handleToggleProvider = (provider: IProviderConfig, enabled: boolean) => {
    settings.updateProviderSettings(provider.name, { ...provider.settings, enabled });

    if (enabled) {
      logStore.logProvider(`Provider ${provider.name} enabled`, { provider: provider.name });
      toast.success(`${provider.name} enabled`);
    } else {
      logStore.logProvider(`Provider ${provider.name} disabled`, { provider: provider.name });
      toast.success(`${provider.name} disabled`);
    }
  };

  const handleUpdateBaseUrl = (provider: IProviderConfig, baseUrl: string) => {
    let newBaseUrl: string | undefined = baseUrl;

    if (newBaseUrl && newBaseUrl.trim().length === 0) {
      newBaseUrl = undefined;
    }

    settings.updateProviderSettings(provider.name, { ...provider.settings, baseUrl: newBaseUrl });
    logStore.logProvider(`Base URL updated for ${provider.name}`, {
      provider: provider.name,
      baseUrl: newBaseUrl,
    });
    toast.success(`${provider.name} base URL updated`);
    setEditingProvider(null);
  };

  return (
    <div className="space-y-6">
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                      </div>

                      {providerBaseUrlEnvKeys[provider.name]?.baseUrlKey && (
                        <div className="mt-2 text-xs text-green-500">
                          <div className="flex items-center gap-1">
                            <div className="i-ph:info" />
                            <span>Environment URL set in .env file</span>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )}
                </div>
              </div>

              <motion.div
                className="absolute inset-0 border-2 border-purple-500/0 rounded-lg pointer-events-none"
                animate={{
                  borderColor: provider.settings.enabled ? 'rgba(168, 85, 247, 0.2)' : 'rgba(168, 85, 247, 0)',
                  scale: provider.settings.enabled ? 1 : 0.98,
                }}
                transition={{ duration: 0.2 }}
              />

              {provider.name === 'Ollama' && provider.settings.enabled && (
                <motion.button
                  onClick={() => setShowOllamaUpdater(true)}
                  className={classNames(settingsStyles.button.base, settingsStyles.button.secondary, 'ml-2')}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="i-ph:arrows-clockwise" />
                  Update Models
                </motion.button>
              )}
            </motion.div>
          ))}
        </div>
      </motion.div>

      <DialogRoot open={showOllamaUpdater} onOpenChange={setShowOllamaUpdater}>
        <Dialog>
          <div className="p-6">
            <OllamaModelUpdater />
          </div>
        </Dialog>
      </DialogRoot>
    </div>
  );
};

export default LocalProvidersTab;
