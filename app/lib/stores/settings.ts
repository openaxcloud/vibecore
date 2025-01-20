import { atom, map } from 'nanostores';
import { workbenchStore } from './workbench';
import { PROVIDER_LIST } from '~/utils/constants';
import type { IProviderConfig } from '~/types/model';
import type { TabVisibilityConfig, TabWindowConfig } from '~/components/settings/settings.types';
import { DEFAULT_TAB_CONFIG } from '~/components/settings/settings.types';
import Cookies from 'js-cookie';

export interface Shortcut {
  key: string;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  ctrlOrMetaKey?: boolean;
  action: () => void;
}

export interface Shortcuts {
  toggleTerminal: Shortcut;
}

export const URL_CONFIGURABLE_PROVIDERS = ['Ollama', 'LMStudio', 'OpenAILike'];
export const LOCAL_PROVIDERS = ['OpenAILike', 'LMStudio', 'Ollama'];

export type ProviderSetting = Record<string, IProviderConfig>;

export const shortcutsStore = map<Shortcuts>({
  toggleTerminal: {
    key: 'j',
    ctrlOrMetaKey: true,
    action: () => workbenchStore.toggleTerminal(),
  },
});

const initialProviderSettings: ProviderSetting = {};
PROVIDER_LIST.forEach((provider) => {
  initialProviderSettings[provider.name] = {
    ...provider,
    settings: {
      enabled: true,
    },
  };
});

//TODO: need to create one single map for all these flags

export const providersStore = map<ProviderSetting>(initialProviderSettings);

export const isDebugMode = atom(false);

// Initialize event logs from cookie or default to false
const savedEventLogs = Cookies.get('isEventLogsEnabled');
export const isEventLogsEnabled = atom(savedEventLogs === 'true');

export const isLocalModelsEnabled = atom(true);

export const promptStore = atom<string>('default');

export const latestBranchStore = atom(false);

export const autoSelectStarterTemplate = atom(false);
export const enableContextOptimizationStore = atom(false);

// Initialize tab configuration from cookie or default
const savedTabConfig = Cookies.get('tabConfiguration');
const initialTabConfig: TabWindowConfig = savedTabConfig
  ? JSON.parse(savedTabConfig)
  : {
      userTabs: DEFAULT_TAB_CONFIG.filter((tab) => tab.window === 'user'),
      developerTabs: DEFAULT_TAB_CONFIG.filter((tab) => tab.window === 'developer'),
    };

export const tabConfigurationStore = map<TabWindowConfig>(initialTabConfig);

// Helper function to update tab configuration
export const updateTabConfiguration = (config: TabVisibilityConfig) => {
  const currentConfig = tabConfigurationStore.get();
  const isUserTab = config.window === 'user';
  const targetArray = isUserTab ? 'userTabs' : 'developerTabs';

  // Only update the tab in its respective window
  const updatedTabs = currentConfig[targetArray].map((tab) => (tab.id === config.id ? { ...config } : tab));

  // If tab doesn't exist in this window yet, add it
  if (!updatedTabs.find((tab) => tab.id === config.id)) {
    updatedTabs.push(config);
  }

  // Create new config, only updating the target window's tabs
  const newConfig: TabWindowConfig = {
    ...currentConfig,
    [targetArray]: updatedTabs,
  };

  tabConfigurationStore.set(newConfig);
  Cookies.set('tabConfiguration', JSON.stringify(newConfig));
};

// Helper function to reset tab configuration
export const resetTabConfiguration = () => {
  const defaultConfig: TabWindowConfig = {
    userTabs: DEFAULT_TAB_CONFIG.filter((tab) => tab.window === 'user'),
    developerTabs: DEFAULT_TAB_CONFIG.filter((tab) => tab.window === 'developer'),
  };
  tabConfigurationStore.set(defaultConfig);
  Cookies.set('tabConfiguration', JSON.stringify(defaultConfig));
};
