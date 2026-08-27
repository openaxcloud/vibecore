import { motion } from 'framer-motion';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { GitHubOauthConnectButton } from './GitHubOauthConnectButton';

import { Button } from '~/components/ui/Button';
import { useGitHubConnection } from '~/lib/hooks';
import { getSourceControlConnectionsCopy } from '~/lib/i18n/catalogs/source-control-connections';
import { classNames } from '~/utils/classNames';

interface ConnectionTestResult {
  status: 'success' | 'error' | 'testing';
  message: string;
  timestamp?: number;
}

interface GitHubConnectionProps {
  connectionTest: ConnectionTestResult | null;
  onTestConnection: () => void;
}

export function GitHubConnection({ connectionTest, onTestConnection }: GitHubConnectionProps) {
  const { isConnected, isLoading, isConnecting, connect, disconnect, error } = useGitHubConnection();
  const { i18n } = useTranslation();
  const copy = getSourceControlConnectionsCopy(i18n.resolvedLanguage ?? i18n.language);

  const [token, setToken] = React.useState('');
  const [tokenType, setTokenType] = React.useState<'classic' | 'fine-grained'>('classic');

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!token.trim()) {
      return;
    }

    try {
      await connect(token, tokenType);
      setToken(''); // Clear token on successful connection
    } catch (caught) {
      console.error('GitHub connection failed', caught);

      // Error handling is done in the hook
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8" role="status" aria-live="polite" aria-busy="true">
        <div className="flex items-center gap-2">
          <div className="i-ph:spinner-gap-bold animate-spin w-4 h-4" aria-hidden="true" />
          <span className="text-bolt-elements-textSecondary">{copy['sourceControl.common.loadingConnection']}</span>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      className="bg-bolt-elements-background dark:bg-bolt-elements-background border border-bolt-elements-borderColor dark:border-bolt-elements-borderColor rounded-lg"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
    >
      <div className="space-y-6 p-4 sm:p-6">
        {!isConnected && (
          <>
            <div className="rounded-lg border border-bolt-elements-borderColor dark:border-bolt-elements-borderColor p-4">
              <h3 className="text-sm font-medium text-bolt-elements-textPrimary dark:text-bolt-elements-textPrimary mb-2">
                {copy['sourceControl.github.oauth.title']}
              </h3>
              <p className="text-xs text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary mb-3">
                {copy['sourceControl.github.oauth.description']}
              </p>
              <GitHubOauthConnectButton />
            </div>

            <div className="text-xs text-bolt-elements-textSecondary bg-bolt-elements-background-depth-1 dark:bg-bolt-elements-background-depth-1 p-3 rounded-lg mb-4">
              <p className="mb-1 flex flex-wrap items-center gap-1">
                <span
                  className="i-ph:lightbulb w-3.5 h-3.5 shrink-0 text-bolt-elements-icon-success dark:text-bolt-elements-icon-success"
                  aria-hidden="true"
                />
                <span className="font-medium">{copy['sourceControl.github.legacy.label']}</span>{' '}
                {copy['sourceControl.github.legacy.intro']}{' '}
                <code className="px-1 py-0.5 bg-bolt-elements-background-depth-2 dark:bg-bolt-elements-background-depth-2 rounded">
                  VITE_GITHUB_ACCESS_TOKEN
                </code>{' '}
                {copy['sourceControl.github.legacy.automaticSuffix']}{' '}
                {copy['sourceControl.github.legacy.fineGrainedPrefix']}{' '}
                <code className="px-1 py-0.5 bg-bolt-elements-background-depth-2 dark:bg-bolt-elements-background-depth-2 rounded">
                  VITE_GITHUB_TOKEN_TYPE=fine-grained
                </code>
                .
              </p>
            </div>
          </>
        )}

        <form onSubmit={handleConnect} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="github-token-type"
                className="block text-sm text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary mb-2"
              >
                {copy['sourceControl.github.token.type']}
              </label>
              <select
                id="github-token-type"
                value={tokenType}
                onChange={(e) => setTokenType(e.target.value as 'classic' | 'fine-grained')}
                disabled={isConnecting || isConnected}
                className={classNames(
                  'w-full px-3 py-2 rounded-lg text-sm',
                  'bg-bolt-elements-background-depth-1 dark:bg-bolt-elements-background-depth-1',
                  'border border-bolt-elements-borderColor dark:border-bolt-elements-borderColor',
                  'text-bolt-elements-textPrimary dark:text-bolt-elements-textPrimary',
                  'focus:outline-none focus:ring-1 focus:ring-bolt-elements-item-contentAccent dark:focus:ring-bolt-elements-item-contentAccent',
                  'disabled:opacity-50',
                )}
              >
                <option value="classic">{copy['sourceControl.github.token.classicOption']}</option>
                <option value="fine-grained">{copy['sourceControl.github.token.fineGrainedOption']}</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="github-access-token"
                className="block text-sm text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary mb-2"
              >
                {tokenType === 'classic'
                  ? copy['sourceControl.github.token.classicLabel']
                  : copy['sourceControl.github.token.fineGrainedLabel']}
              </label>
              <input
                id="github-access-token"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                disabled={isConnecting || isConnected}
                placeholder={
                  tokenType === 'classic'
                    ? copy['sourceControl.github.token.classicPlaceholder']
                    : copy['sourceControl.github.token.fineGrainedPlaceholder']
                }
                className={classNames(
                  'w-full px-3 py-2 rounded-lg text-sm',
                  'bg-bolt-elements-background-depth-3',
                  'border border-bolt-elements-borderColor',
                  'text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary',
                  'focus:outline-none focus:ring-1 focus:ring-bolt-elements-borderColorActive',
                  'disabled:opacity-50',
                )}
              />
              <div className="mt-2 text-sm text-bolt-elements-textSecondary">
                <a
                  href={`https://github.com/settings/tokens${tokenType === 'fine-grained' ? '/beta' : '/new'}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-bolt-elements-borderColorActive hover:underline inline-flex items-center gap-1"
                >
                  {copy['sourceControl.common.getToken']}
                  <div className="i-ph:arrow-square-out w-4 h-4" aria-hidden="true" />
                </a>
                <span className="mx-2">•</span>
                <span>
                  {copy['sourceControl.common.requiredScopes']}{' '}
                  {tokenType === 'classic'
                    ? copy['sourceControl.github.scopes.classic']
                    : copy['sourceControl.github.scopes.fineGrained']}
                </span>
              </div>
            </div>
          </div>

          {error && (
            <div
              className="rounded-lg border border-[var(--status-error-border)] bg-[var(--status-error-bg)] p-4"
              role="alert"
            >
              <p className="text-sm text-[var(--status-error-text)]">{copy['sourceControl.common.connectionError']}</p>
            </div>
          )}

          <div className="flex items-center justify-between">
            {!isConnected ? (
              <button
                type="submit"
                disabled={isConnecting || !token.trim()}
                className={classNames(
                  'min-h-11 px-4 py-2 rounded-lg text-sm flex items-center justify-center gap-2 whitespace-normal',
                  'bg-[var(--vc-ide-accent-action)] text-white',
                  'hover:opacity-90 hover:text-white',
                  'disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200',
                  'transform active:scale-95',
                )}
              >
                {isConnecting ? (
                  <>
                    <div className="i-ph:spinner-gap animate-spin" aria-hidden="true" />
                    {copy['sourceControl.common.connecting']}
                  </>
                ) : (
                  <>
                    <div className="i-ph:plug-charging w-4 h-4" aria-hidden="true" />
                    {copy['sourceControl.common.connect']}
                  </>
                )}
              </button>
            ) : (
              <div className="flex w-full flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                  <button
                    onClick={disconnect}
                    type="button"
                    className={classNames(
                      'min-h-11 px-4 py-2 rounded-lg text-sm flex items-center justify-center gap-2 whitespace-normal',
                      'bg-red-500 text-white',
                      'hover:bg-red-600',
                    )}
                  >
                    <div className="i-ph:plug w-4 h-4" aria-hidden="true" />
                    {copy['sourceControl.common.disconnect']}
                  </button>
                  <span className="text-sm text-bolt-elements-textSecondary flex items-center gap-1">
                    <div className="i-ph:check-circle w-4 h-4 shrink-0 text-green-500" aria-hidden="true" />
                    {copy['sourceControl.github.connected']}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => window.open('https://github.com/dashboard', '_blank', 'noopener,noreferrer')}
                    className="min-h-11 flex-1 items-center justify-center gap-2 whitespace-normal hover:bg-bolt-elements-item-backgroundActive/10 hover:text-bolt-elements-textPrimary dark:hover:text-bolt-elements-textPrimary transition-colors sm:flex-none"
                  >
                    <div className="i-ph:layout w-4 h-4" aria-hidden="true" />
                    {copy['sourceControl.common.dashboard']}
                  </Button>
                  <Button
                    type="button"
                    onClick={onTestConnection}
                    disabled={connectionTest?.status === 'testing'}
                    variant="outline"
                    className="min-h-11 flex-1 items-center justify-center gap-2 whitespace-normal hover:bg-bolt-elements-item-backgroundActive/10 hover:text-bolt-elements-textPrimary dark:hover:text-bolt-elements-textPrimary transition-colors sm:flex-none"
                  >
                    {connectionTest?.status === 'testing' ? (
                      <>
                        <div className="i-ph:spinner-gap w-4 h-4 animate-spin" aria-hidden="true" />
                        {copy['sourceControl.common.testing']}
                      </>
                    ) : (
                      <>
                        <div className="i-ph:plug-charging w-4 h-4" aria-hidden="true" />
                        {copy['sourceControl.common.testConnection']}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </form>
      </div>
    </motion.div>
  );
}
