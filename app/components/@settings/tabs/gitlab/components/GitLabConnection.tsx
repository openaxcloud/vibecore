import { motion } from 'framer-motion';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { Button } from '~/components/ui/Button';
import { useGitLabConnection } from '~/lib/hooks';
import { getSourceControlConnectionsCopy } from '~/lib/i18n/catalogs/source-control-connections';
import { classNames } from '~/utils/classNames';

interface ConnectionTestResult {
  status: 'success' | 'error' | 'testing';
  message: string;
  timestamp?: number;
}

interface GitLabConnectionProps {
  connectionTest: ConnectionTestResult | null;
  onTestConnection: () => void;
}

export default function GitLabConnection({ connectionTest, onTestConnection }: GitLabConnectionProps) {
  const { isConnected, isConnecting, connection, error, connect, disconnect } = useGitLabConnection();
  const { i18n } = useTranslation();
  const copy = getSourceControlConnectionsCopy(i18n.resolvedLanguage ?? i18n.language);

  const [token, setToken] = useState('');
  const [gitlabUrl, setGitlabUrl] = useState('https://gitlab.com');

  const handleConnect = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!token.trim()) {
      return;
    }

    try {
      await connect(token, gitlabUrl);
      setToken(''); // Clear token on successful connection
    } catch (error) {
      console.error('GitLab connect failed:', error);

      // Error handling is done in the hook
    }
  };

  const handleDisconnect = () => {
    disconnect();
    toast.success(copy['sourceControl.gitlab.disconnected']);
  };

  return (
    <motion.div
      className="bg-bolt-elements-background border border-bolt-elements-borderColor rounded-lg"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
    >
      <div className="space-y-6 p-4 sm:p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 shrink-0 text-orange-600">
              <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 0 1-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 0 1 4.82 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.49h8.1l2.44-7.51A.42.42 0 0 1 18.6 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.51L23 13.45a.84.84 0 0 1-.35.94z"
                />
              </svg>
            </div>
            <h3 className="min-w-0 text-base font-medium text-bolt-elements-textPrimary">
              {copy['sourceControl.gitlab.title']}
            </h3>
          </div>
        </div>

        {!isConnected && (
          <div className="text-xs text-bolt-elements-textSecondary bg-bolt-elements-background-depth-1 p-3 rounded-lg mb-4">
            <p className="mb-1 flex flex-wrap items-center gap-1">
              <span
                className="i-ph:lightbulb w-3.5 h-3.5 shrink-0 text-bolt-elements-icon-success"
                aria-hidden="true"
              />
              <span className="font-medium">{copy['sourceControl.gitlab.tip.label']}</span>{' '}
              {copy['sourceControl.gitlab.tip.intro']}{' '}
              <code className="px-1 py-0.5 bg-bolt-elements-background-depth-2 rounded">VITE_GITLAB_ACCESS_TOKEN</code>{' '}
              {copy['sourceControl.gitlab.tip.automaticSuffix']}
            </p>
            <p>
              {copy['sourceControl.gitlab.tip.selfHostedPrefix']}{' '}
              <code className="px-1 py-0.5 bg-bolt-elements-background-depth-2 rounded">
                VITE_GITLAB_URL=https://your-gitlab-instance.com
              </code>
            </p>
          </div>
        )}

        <form onSubmit={handleConnect} className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label htmlFor="gitlab-url" className="block text-sm text-bolt-elements-textSecondary mb-2">
                {copy['sourceControl.gitlab.urlLabel']}
              </label>
              <input
                id="gitlab-url"
                type="text"
                value={gitlabUrl}
                onChange={(e) => setGitlabUrl(e.target.value)}
                disabled={isConnecting || isConnected}
                placeholder="https://gitlab.com"
                className={classNames(
                  'w-full px-3 py-2 rounded-lg text-sm',
                  'bg-bolt-elements-background-depth-1',
                  'border border-bolt-elements-borderColor',
                  'text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary',
                  'focus:outline-none focus:ring-1 focus:ring-bolt-elements-borderColorActive',
                  'disabled:opacity-50',
                )}
              />
            </div>

            <div>
              <label htmlFor="gitlab-access-token" className="block text-sm text-bolt-elements-textSecondary mb-2">
                {copy['sourceControl.gitlab.token.label']}
              </label>
              <input
                id="gitlab-access-token"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                disabled={isConnecting || isConnected}
                placeholder={copy['sourceControl.gitlab.token.placeholder']}
                className={classNames(
                  'w-full px-3 py-2 rounded-lg text-sm',
                  'bg-bolt-elements-background-depth-1',
                  'border border-bolt-elements-borderColor',
                  'text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary',
                  'focus:outline-none focus:ring-1 focus:ring-bolt-elements-borderColorActive',
                  'disabled:opacity-50',
                )}
              />
              <div className="mt-2 text-sm text-bolt-elements-textSecondary">
                <a
                  href={`${gitlabUrl}/-/user_settings/personal_access_tokens`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-bolt-elements-borderColorActive hover:underline inline-flex items-center gap-1"
                >
                  {copy['sourceControl.common.getToken']}
                  <div className="i-ph:arrow-square-out w-4 h-4" aria-hidden="true" />
                </a>
                <span className="mx-2">•</span>
                <span>
                  {copy['sourceControl.common.requiredScopes']} {copy['sourceControl.gitlab.scopes']}
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
                  'bg-[#FC6D26] text-white',
                  'hover:bg-[#E24329] hover:text-white',
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
              <>
                <div className="flex w-full flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                    <button
                      onClick={handleDisconnect}
                      type="button"
                      className={classNames(
                        'min-h-11 px-4 py-2 rounded-lg text-sm flex items-center justify-center gap-2 whitespace-normal',
                        'bg-red-600 text-white',
                        'hover:bg-red-600',
                      )}
                    >
                      <div className="i-ph:plug w-4 h-4" aria-hidden="true" />
                      {copy['sourceControl.common.disconnect']}
                    </button>
                    <span className="text-sm text-bolt-elements-textSecondary flex items-center gap-1">
                      <div className="i-ph:check-circle w-4 h-4 shrink-0 text-green-500" aria-hidden="true" />
                      {copy['sourceControl.gitlab.connected']}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        window.open(
                          `${connection?.gitlabUrl || 'https://gitlab.com'}/dashboard`,
                          '_blank',
                          'noopener,noreferrer',
                        )
                      }
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
              </>
            )}
          </div>
        </form>
      </div>
    </motion.div>
  );
}
