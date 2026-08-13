import Cookies from 'js-cookie';
import React, { useState, useEffect, useCallback } from 'react';
import { IconButton } from '~/components/ui/IconButton';
import { RevealButton } from '~/components/ui/RevealButton';
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
  const [isEditing, setIsEditing] = useState(false);
  const [tempKey, setTempKey] = useState(apiKey);
  const [isEnvKeySet, setIsEnvKeySet] = useState(false);
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

  const checkEnvApiKey = useCallback(async () => {
    // Check cache first
    if (providerEnvKeyStatusCache[provider.name] !== undefined) {
      setIsEnvKeySet(providerEnvKeyStatusCache[provider.name]);
      return;
    }

    try {
      const response = await fetch(`/api/check-env-key?provider=${encodeURIComponent(provider.name)}`);
      const data = await response.json();
      const isSet = (data as { isSet: boolean }).isSet;

      // Cache the result
      providerEnvKeyStatusCache[provider.name] = isSet;
      setIsEnvKeySet(isSet);
    } catch (error) {
      console.error('Failed to check environment API key:', error);
      setIsEnvKeySet(false);
    }
  }, [provider.name]);

  useEffect(() => {
    checkEnvApiKey();
  }, [checkEnvApiKey]);

  const handleSave = () => {
    // Save to parent state
    setApiKey(tempKey);

    // Save to cookies
    const currentKeys = getApiKeysFromCookies();
    const newKeys = { ...currentKeys, [provider.name]: tempKey };
    Cookies.set('apiKeys', JSON.stringify(newKeys));

    setIsEditing(false);
  };

  return (
    <div
      className="bolt-api-key-manager flex items-center justify-between gap-3 px-1 py-3"
      data-testid="api-key-manager"
    >
      <div className="bolt-api-key-manager-summary flex min-w-0 flex-1 items-center gap-2">
        <div className="bolt-api-key-status-row flex min-w-0 items-center gap-2">
          <span className="text-sm font-medium text-bolt-elements-textSecondary">{provider?.name} API Key:</span>
          {!isEditing && (
            <div className="bolt-api-key-status flex min-w-0 items-center gap-2">
              {apiKey ? (
                <>
                  <div className="i-ph:check-circle-fill h-4 w-4 flex-shrink-0 text-green-500" />
                  <span className="text-xs text-[var(--status-success-text)]">Set via UI</span>
                </>
              ) : isEnvKeySet ? (
                <>
                  <div className="i-ph:check-circle-fill h-4 w-4 flex-shrink-0 text-green-500" />
                  <span className="text-xs text-[var(--status-success-text)]">Set via environment variable</span>
                </>
              ) : (
                <>
                  <div className="i-ph:x-circle-fill h-4 w-4 flex-shrink-0 text-red-500" />
                  <span className="text-xs text-[var(--status-error-text)]">
                    Not Set (Please set via UI or ENV_VAR)
                  </span>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="bolt-api-key-manager-actions flex shrink-0 items-center gap-2">
        {isEditing ? (
          <div className="bolt-api-key-editor flex min-w-0 items-center gap-2">
            <div className="relative w-full min-w-0">
              <input
                type={keyRevealed ? 'text' : 'password'}
                value={tempKey}
                placeholder="Enter API Key"
                onChange={(e) => setTempKey(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSave();
                  } else if (e.key === 'Escape') {
                    setIsEditing(false);
                  }
                }}
                aria-label={`${provider?.name ?? ''} API key`.trim()}
                name="apiKey"
                autoComplete="off"
                style={{ fontFamily: 'var(--vc-font-code)' }}
                className="bolt-api-key-input w-full rounded border border-bolt-elements-borderColor pl-3 pr-11 py-1.5 text-sm
                          bg-bolt-elements-prompt-background text-bolt-elements-textPrimary
                          focus:outline-none focus:ring-2 focus:ring-bolt-elements-focus"
              />
              <RevealButton
                revealed={keyRevealed}
                onToggle={() => setKeyRevealed((current) => !current)}
                subject="API key"
                className="absolute right-1 top-1/2 -translate-y-1/2"
              />
            </div>
            <IconButton
              onClick={handleSave}
              title="Save API Key"
              className="bg-green-500/10 hover:bg-green-500/20 text-green-500"
            >
              <div className="i-ph:check w-4 h-4" />
            </IconButton>
            <IconButton
              onClick={() => setIsEditing(false)}
              title="Cancel"
              className="bg-red-500/10 hover:bg-red-500/20 text-red-500"
            >
              <div className="i-ph:x w-4 h-4" />
            </IconButton>
          </div>
        ) : (
          <>
            {
              <IconButton
                onClick={() => setIsEditing(true)}
                title="Edit API Key"
                className="bg-blue-500/10 hover:bg-blue-500/20 text-blue-500"
              >
                <div className="i-ph:pencil-simple w-4 h-4" />
              </IconButton>
            }
            {provider?.getApiKeyLink && !apiKey && (
              <IconButton
                onClick={() => window.open(provider?.getApiKeyLink)}
                title="Get API Key"
                className="bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent opacity-90 hover:opacity-100 flex items-center gap-2"
              >
                <span className="text-xs whitespace-nowrap">{provider?.labelForGetApiKey || 'Get API Key'}</span>
                <div className={`${provider?.icon || 'i-ph:key'} w-4 h-4`} />
              </IconButton>
            )}
          </>
        )}
      </div>
    </div>
  );
};
