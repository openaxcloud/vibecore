import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import McpMarketplace from '~/components/@settings/tabs/mcp/McpMarketplace';
import McpServerList from '~/components/@settings/tabs/mcp/McpServerList';
import type { MCPConfig } from '~/lib/services/mcpService';
import { useMCPStore } from '~/lib/stores/mcp';
import { classNames } from '~/utils/classNames';

type McpTabView = 'marketplace' | 'configuration';

const EXAMPLE_MCP_CONFIG: MCPConfig = {
  mcpServers: {
    everything: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-everything'],
    },
    deepwiki: {
      type: 'streamable-http',
      url: 'https://mcp.deepwiki.com/mcp',
    },
    'local-sse': {
      type: 'sse',
      url: 'http://localhost:8000/sse',
      headers: {
        Authorization: 'Bearer mytoken123',
      },
    },
  },
};

export default function McpTab() {
  const { t } = useTranslation();

  const settings = useMCPStore((state) => state.settings);
  const isInitialized = useMCPStore((state) => state.isInitialized);
  const serverTools = useMCPStore((state) => state.serverTools);
  const initialize = useMCPStore((state) => state.initialize);
  const updateSettings = useMCPStore((state) => state.updateSettings);
  const checkServersAvailabilities = useMCPStore((state) => state.checkServersAvailabilities);

  const [isSaving, setIsSaving] = useState(false);
  const [mcpConfigText, setMCPConfigText] = useState('');
  const [maxLLMSteps, setMaxLLMSteps] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [isCheckingServers, setIsCheckingServers] = useState(false);
  const [expandedServer, setExpandedServer] = useState<string | null>(null);
  const [view, setView] = useState<McpTabView>('marketplace');

  useEffect(() => {
    if (!isInitialized) {
      initialize().catch((err) => {
        console.error('Failed to initialize MCP settings', err);
        setError(t('settings.mcp.configuration.initializeFailed'));
        toast.error(t('settings.copy.failedToLoadMcpConfiguration_7c3c8989'));
      });
    }
  }, [initialize, isInitialized, t]);

  useEffect(() => {
    setMCPConfigText(JSON.stringify(settings.mcpConfig, null, 2));
    setMaxLLMSteps(settings.maxLLMSteps);
    setError(null);
  }, [settings]);

  const parsedConfig = useMemo(() => {
    try {
      return JSON.parse(mcpConfigText) as MCPConfig;
    } catch {
      return null;
    }
  }, [mcpConfigText]);

  /*
   * Surface JSON parse errors from an effect — calling setError during render
   * (inside the useMemo above) triggers React's "cannot update while rendering".
   */
  useEffect(() => {
    if (parsedConfig) {
      setError(null);
      return;
    }

    try {
      JSON.parse(mcpConfigText);
    } catch {
      setError(t('settings.mcp.configuration.invalidJson'));
    }
  }, [mcpConfigText, parsedConfig, t]);

  const handleMaxLLMCallChange = (value: string) => {
    const parsed = parseInt(value, 10);

    if (Number.isNaN(parsed)) {
      return;
    }

    setMaxLLMSteps(Math.min(20, Math.max(1, parsed)));
  };

  const handleSave = async () => {
    if (!parsedConfig) {
      return;
    }

    setIsSaving(true);

    try {
      await updateSettings({
        mcpConfig: parsedConfig,
        maxLLMSteps,
      });
      toast.success(t('settings.copy.mcpConfigurationSaved_aac7ff26'));

      setError(null);
    } catch (e) {
      console.error('Failed to save MCP configuration', e);
      setError(t('settings.copy.failedToSaveMcpConfiguration_36fd5c51'));
      toast.error(t('settings.copy.failedToSaveMcpConfiguration_36fd5c51'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleLoadExample = () => {
    setMCPConfigText(JSON.stringify(EXAMPLE_MCP_CONFIG, null, 2));
    setError(null);
  };

  const checkServerAvailability = async () => {
    if (serverEntries.length === 0) {
      return;
    }

    setIsCheckingServers(true);
    setError(null);

    try {
      await checkServersAvailabilities();
    } catch (e) {
      console.error('Failed to check MCP server availability', e);
      setError(t('settings.mcp.configuration.availabilityFailed'));
    } finally {
      setIsCheckingServers(false);
    }
  };

  const toggleServerExpanded = (serverName: string) => {
    setExpandedServer(expandedServer === serverName ? null : serverName);
  };

  const serverEntries = useMemo(() => Object.entries(serverTools), [serverTools]);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div
        className="inline-flex p-0.5 rounded-lg bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor"
        role="tablist"
        aria-label={t('settings.copy.mcpView_2cf27783')}
      >
        <button
          role="tab"
          type="button"
          aria-selected={view === 'marketplace'}
          onClick={() => setView('marketplace')}
          className={classNames(
            'px-3 py-1.5 rounded-md text-xs transition-colors',
            view === 'marketplace'
              ? 'bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent'
              : 'text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary',
          )}
        >
          {t('settings.copy.marketplace_c608981d')}
        </button>
        <button
          role="tab"
          type="button"
          aria-selected={view === 'configuration'}
          onClick={() => setView('configuration')}
          className={classNames(
            'px-3 py-1.5 rounded-md text-xs transition-colors',
            view === 'configuration'
              ? 'bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent'
              : 'text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary',
          )}
        >
          {t('settings.copy.configuration_b332c349')}
        </button>
      </div>

      {view === 'marketplace' && <McpMarketplace />}

      {view === 'configuration' && (
        <>
          <section aria-labelledby="server-status-heading">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-base font-medium text-bolt-elements-textPrimary">
                {t('settings.copy.mcpServersConfigured_6fcafbc4')}
              </h2>{' '}
              <button
                onClick={checkServerAvailability}
                disabled={isCheckingServers || !parsedConfig || serverEntries.length === 0}
                className={classNames(
                  'px-3 py-1.5 rounded-lg text-sm',
                  'bg-bolt-elements-background-depth-3 hover:bg-bolt-elements-background-depth-4',
                  'text-bolt-elements-textPrimary',
                  'transition-all duration-200',
                  'flex items-center gap-2',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                )}
              >
                {isCheckingServers ? (
                  <div className="i-svg-spinners:90-ring-with-bg w-3 h-3 text-bolt-elements-loader-progress animate-spin" />
                ) : (
                  <div className="i-ph:arrow-counter-clockwise w-3 h-3" />
                )}
                {t('settings.copy.checkAvailability_2071664a')}
              </button>
            </div>
            <McpServerList
              checkingServers={isCheckingServers}
              expandedServer={expandedServer}
              serverEntries={serverEntries}
              toggleServerExpanded={toggleServerExpanded}
            />
          </section>

          <section aria-labelledby="config-section-heading">
            <h2 className="text-base font-medium text-bolt-elements-textPrimary mb-3">
              {t('settings.copy.configuration_b332c349')}
            </h2>

            <div className="space-y-4">
              <div>
                <label htmlFor="mcp-config" className="block text-sm text-bolt-elements-textSecondary mb-2">
                  {t('settings.copy.configurationJson_1d1271b8')}
                </label>
                <textarea
                  id="mcp-config"
                  value={mcpConfigText}
                  onChange={(e) => setMCPConfigText(e.target.value)}
                  className={classNames(
                    'w-full px-3 py-2 rounded-lg text-sm font-mono h-72',
                    'bg-bolt-elements-background-depth-3',
                    'border',
                    error ? 'border-bolt-elements-icon-error' : 'border-bolt-elements-borderColor',
                    'text-bolt-elements-textPrimary',
                    'focus:outline-none focus:ring-1 focus:ring-bolt-elements-focus',
                  )}
                />
              </div>
              <div>{error && <p className="mt-2 mb-2 text-sm text-bolt-elements-icon-error">{error}</p>}</div>
              <div>
                <label htmlFor="max-llm-steps" className="block text-sm text-bolt-elements-textSecondary mb-2">
                  {t('settings.copy.maximumNumberOfSequentialLlmCallsSteps_9538ba31')}
                </label>
                <input
                  id="max-llm-steps"
                  type="number"
                  placeholder={t('settings.copy.maximumNumberOfSequentialLlmCalls_a536e28a')}
                  min="1"
                  max="20"
                  value={maxLLMSteps}
                  onChange={(e) => handleMaxLLMCallChange(e.target.value)}
                  className="w-full px-3 py-2 text-bolt-elements-textPrimary text-sm rounded-lg bg-bolt-elements-background-depth-4 border border-bolt-elements-borderColor dark:border-bolt-elements-borderColor-dark focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="mt-2 text-sm text-bolt-elements-textSecondary">
                {t('settings.copy.theMcpConfigurationFormatIsIdenticalToThe_5b798888')}
                <a
                  href="https://modelcontextprotocol.io/examples"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-bolt-elements-link hover:underline inline-flex items-center gap-1"
                >
                  {t('settings.copy.viewExampleServers_0df93f04')}
                  <div className="i-ph:arrow-square-out w-4 h-4" />
                </a>
              </div>
            </div>
          </section>

          <div className="flex flex-wrap justify-between gap-3 mt-6">
            <button
              onClick={handleLoadExample}
              className="px-4 py-2 rounded-lg text-sm border border-bolt-elements-borderColor
                    bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary
                    hover:bg-bolt-elements-background-depth-3"
            >
              {t('settings.copy.loadExample_c3f32d3a')}
            </button>

            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={isSaving || !parsedConfig}
                aria-disabled={isSaving || !parsedConfig}
                className={classNames(
                  'px-4 py-2 rounded-lg text-sm flex items-center gap-2',
                  'bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent',
                  'hover:bg-bolt-elements-item-backgroundActive',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                )}
              >
                <div className="i-ph:floppy-disk w-4 h-4" />
                {isSaving ? t('settings.mcp.configuration.saving') : t('settings.mcp.configuration.save')}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
