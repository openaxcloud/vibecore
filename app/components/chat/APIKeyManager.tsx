import Cookies from 'js-cookie';
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '~/components/ui/IconButton';
import { RevealButton } from '~/components/ui/RevealButton';
import { formatChatConnectorsCopy, getChatConnectorsCopy } from '~/lib/i18n/catalogs/chat-connectors';
import type { ProviderInfo } from '~/types/model';

interface APIKeyManagerProps {
  provider: ProviderInfo;
  apiKey: string;
  setApiKey: (key: string) => void;
  getApiKeyLink?: string;
  labelForGetApiKey?: string;
}

// cache which stores whether the provider's API key is set via environment variable
const providerEnvKeyStatusCache: Record<string, boolean> = {};

const apiKeyMemoizeCache: { [k: string]: Record<string, string> } = {};

export function getApiKeysFromCookies() {
  const storedApiKeys = Cookies.get('apiKeys');

  let parsedKeys: Record<string, string> = {};

  if (storedApiKeys) {
    parsedKeys = apiKeyMemoizeCache[storedApiKeys];

    if (!parsedKeys) {
      try {
        /*
         * A malformed/tampered apiKeys cookie must not throw an uncaught SyntaxError
         * that breaks chat rendering — fall back to an empty key set.
         */
        parsedKeys = apiKeyMemoizeCache[storedApiKeys] = JSON.parse(storedApiKeys);
      } catch {
        parsedKeys = {};
      }
    }
  }

  return parsedKeys;
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export const APIKeyManager: React.FC<APIKeyManagerProps> = ({ provider, apiKey, setApiKey }) => {
  const { i18n } = useTranslation();
  const copy = getChatConnectorsCopy(i18n.resolvedLanguage ?? i18n.language);
  const [isEditing, setIsEditing] = useState(false);
  const [tempKey, setTempKey] = useState(apiKey);
  const [isEnvKeySet, setIsEnvKeySet] = useState(false);
  const [isEnvKeyChecking, setIsEnvKeyChecking] = useState(true);
  const [envKeyCheckFailed, setEnvKeyCheckFailed] = useState(false);
  const [keyRevealed, setKeyRevealed] = useState(false);

  // Reset states and load saved key when provider changes
  useEffect(() => {
    // Load saved API key from cookies for this provider
    const savedKeys = getApiKeysFromCookies();
    const savedKey = savedKeys[provider.name] || '';

    setTempKey(savedKey);
    setApiKey(savedKey);
    setIsEditing(false);
    setKeyRevealed(false);
  }, [provider.name]);

  useEffect(() => {
    let active = true;

    async function checkEnvApiKey() {
      setIsEnvKeyChecking(true);
      setEnvKeyCheckFailed(false);

      const cachedStatus = providerEnvKeyStatusCache[provider.name];

      if (cachedStatus !== undefined) {
        setIsEnvKeySet(cachedStatus);
        setIsEnvKeyChecking(false);

        return;
      }

      try {
        const response = await fetch(`/api/check-env-key?provider=${encodeURIComponent(provider.name)}`);
        const data = (await response.json()) as { isSet?: unknown };

        if (!response.ok || typeof data.isSet !== 'boolean') {
          throw new Error(String(response.status));
        }

        providerEnvKeyStatusCache[provider.name] = data.isSet;

        if (active) {
          setIsEnvKeySet(data.isSet);
        }
      } catch (error) {
        console.error(error);

        if (active) {
          setIsEnvKeySet(false);
          setEnvKeyCheckFailed(true);
        }
      } finally {
        if (active) {
          setIsEnvKeyChecking(false);
        }
      }
    }

    void checkEnvApiKey();

    return () => {
      active = false;
    };
  }, [provider.name]);

  const handleSave = () => {
    // Save to parent state
    setApiKey(tempKey);

    // Save to cookies
    const currentKeys = getApiKeysFromCookies();
    const newKeys = { ...currentKeys, [provider.name]: tempKey };
    Cookies.set('apiKeys', JSON.stringify(newKeys));

    setIsEditing(false);
  };

  const cancelEditing = () => {
    setTempKey(apiKey);
    setKeyRevealed(false);
    setIsEditing(false);
  };

  const providerName = provider.name;

  const apiKeyLabel = formatChatConnectorsCopy(copy['chatConnectors.apiKey.label'], {
    provider: providerName,
  });
  const getApiKeyLabel =
    providerName === 'LMStudio'
      ? copy['chatConnectors.apiKey.getLmStudio']
      : providerName === 'Ollama'
        ? copy['chatConnectors.apiKey.downloadOllama']
        : (provider.labelForGetApiKey ?? copy['chatConnectors.apiKey.get']);

  return (
    <div
      className="bolt-api-key-manager flex flex-col items-stretch justify-between gap-3 px-1 py-3 sm:flex-row sm:items-center"
      data-testid="api-key-manager"
    >
      <div className="bolt-api-key-manager-summary flex min-w-0 flex-1 items-center gap-2">
        <div className="bolt-api-key-status-row flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-bolt-elements-textSecondary">{apiKeyLabel}</span>
          {!isEditing && (
            <div className="bolt-api-key-status flex min-w-0 items-center gap-2" role="status">
              {isEnvKeyChecking && !apiKey ? (
                <>
                  <div
                    className="i-ph:spinner-gap-bold h-4 w-4 flex-shrink-0 animate-spin text-bolt-elements-textTertiary"
                    aria-hidden="true"
                  />
                  <span className="text-xs text-bolt-elements-textTertiary">
                    {copy['chatConnectors.apiKey.checkingEnvironment']}
                  </span>
                </>
              ) : apiKey ? (
                <>
                  <div className="i-ph:check-circle-fill h-4 w-4 flex-shrink-0 text-green-500" aria-hidden="true" />
                  <span className="text-xs text-[var(--status-success-text)]">
                    {copy['chatConnectors.apiKey.setInUi']}
                  </span>
                </>
              ) : isEnvKeySet ? (
                <>
                  <div className="i-ph:check-circle-fill h-4 w-4 flex-shrink-0 text-green-500" aria-hidden="true" />
                  <span className="text-xs text-[var(--status-success-text)]">
                    {copy['chatConnectors.apiKey.setInEnvironment']}
                  </span>
                </>
              ) : (
                <>
                  <div className="i-ph:x-circle-fill h-4 w-4 flex-shrink-0 text-red-500" aria-hidden="true" />
                  <span className="text-xs text-[var(--status-error-text)]">
                    {envKeyCheckFailed
                      ? copy['chatConnectors.apiKey.environmentCheckFailed']
                      : copy['chatConnectors.apiKey.notSet']}
                  </span>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="bolt-api-key-manager-actions flex min-w-0 shrink-0 items-center gap-2 sm:justify-end">
        {isEditing ? (
          <div className="bolt-api-key-editor flex w-full min-w-0 flex-wrap items-center gap-2 sm:flex-nowrap">
            <div className="relative min-w-[12rem] flex-1">
              <input
                type={keyRevealed ? 'text' : 'password'}
                value={tempKey}
                placeholder={copy['chatConnectors.apiKey.placeholder']}
                onChange={(e) => setTempKey(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSave();
                  } else if (e.key === 'Escape') {
                    cancelEditing();
                  }
                }}
                aria-label={formatChatConnectorsCopy(copy['chatConnectors.apiKey.inputLabel'], {
                  provider: providerName,
                })}
                name="apiKey"
                autoComplete="off"
                style={{ fontFamily: 'var(--vc-font-code)' }}
                className="bolt-api-key-input min-h-11 w-full rounded border border-bolt-elements-borderColor py-1.5 pl-3 pr-11 text-sm
                          bg-bolt-elements-prompt-background text-bolt-elements-textPrimary
                          focus:outline-none focus:ring-2 focus:ring-bolt-elements-focus"
              />
              <RevealButton
                revealed={keyRevealed}
                onToggle={() => setKeyRevealed((current) => !current)}
                subject={copy['chatConnectors.apiKey.revealSubject']}
                className="absolute right-0 top-1/2 min-h-11 min-w-11 -translate-y-1/2"
              />
            </div>
            <IconButton
              onClick={handleSave}
              title={copy['chatConnectors.apiKey.save']}
              className="min-h-11 min-w-11 bg-green-500/10 text-green-500 hover:bg-green-500/20"
            >
              <div className="i-ph:check h-4 w-4" aria-hidden="true" />
            </IconButton>
            <IconButton
              onClick={cancelEditing}
              title={copy['chatConnectors.apiKey.cancel']}
              className="min-h-11 min-w-11 bg-red-500/10 text-red-500 hover:bg-red-500/20"
            >
              <div className="i-ph:x h-4 w-4" aria-hidden="true" />
            </IconButton>
          </div>
        ) : (
          <>
            {
              <IconButton
                onClick={() => setIsEditing(true)}
                title={copy['chatConnectors.apiKey.edit']}
                className="min-h-11 min-w-11 bg-blue-500/10 text-blue-500 hover:bg-blue-500/20"
              >
                <div className="i-ph:pencil-simple h-4 w-4" aria-hidden="true" />
              </IconButton>
            }
            {provider?.getApiKeyLink && !apiKey && (
              <IconButton
                onClick={() => window.open(provider.getApiKeyLink, '_blank', 'noopener,noreferrer')}
                title={copy['chatConnectors.apiKey.get']}
                className="flex min-h-11 min-w-11 items-center gap-2 whitespace-normal bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent opacity-90 hover:opacity-100"
              >
                <span className="text-xs">{getApiKeyLabel}</span>
                <div className={`${provider.icon || 'i-ph:key'} h-4 w-4 shrink-0`} aria-hidden="true" />
              </IconButton>
            )}
          </>
        )}
      </div>
    </div>
  );
};
