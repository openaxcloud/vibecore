import { useStore } from '@nanostores/react';
import { motion } from 'framer-motion';
import React, { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { logStore } from '~/lib/stores/logs';
import {
  vercelConnection,
  isConnecting,
  isFetchingStats,
  updateVercelConnection,
  fetchVercelStats,
  autoConnectVercel,
} from '~/lib/stores/vercel';
import { classNames } from '~/utils/classNames';

export default function VercelConnection() {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language ?? 'en';

  console.log('VercelConnection component mounted');

  const connection = useStore(vercelConnection);
  const connecting = useStore(isConnecting);
  const fetchingStats = useStore(isFetchingStats);
  const [isProjectsExpanded, setIsProjectsExpanded] = useState(false);
  const hasInitialized = useRef(false);

  console.log('VercelConnection initial state:', {
    connection: {
      user: connection.user,
      token: connection.token ? '[TOKEN_EXISTS]' : '[NO_TOKEN]',
    },
    envToken: import.meta.env?.VITE_VERCEL_ACCESS_TOKEN ? '[ENV_TOKEN_EXISTS]' : '[NO_ENV_TOKEN]',
  });

  useEffect(() => {
    // Prevent multiple initializations
    if (hasInitialized.current) {
      console.log('Vercel: Already initialized, skipping');
      return;
    }

    const initializeConnection = async () => {
      console.log('Vercel initializeConnection:', {
        user: connection.user,
        token: connection.token ? '[TOKEN_EXISTS]' : '[NO_TOKEN]',
        envToken: import.meta.env?.VITE_VERCEL_ACCESS_TOKEN ? '[ENV_TOKEN_EXISTS]' : '[NO_ENV_TOKEN]',
      });

      hasInitialized.current = true;

      // Auto-connect using environment variable if no existing connection but token exists
      if (!connection.user && connection.token && import.meta.env?.VITE_VERCEL_ACCESS_TOKEN) {
        console.log('Vercel: Attempting auto-connection');

        const result = await autoConnectVercel();

        if (result.success) {
          toast.success(t('settings.copy.connectedToVercelAutomatically_a5d70873'));
        } else {
          console.error('Vercel auto-connection failed:', result.error);
        }
      } else if (connection.user && connection.token) {
        // Fetch stats for existing connection
        console.log('Vercel: Fetching stats for existing connection');
        await fetchVercelStats(connection.token);
      } else {
        console.log('Vercel: No auto-connection conditions met');
      }
    };

    /*
     * FAMILLE C — le loquet doit être LIBÉRÉ sur tout chemin d'échec.
     *
     * `hasInitialized` est posé à l'entrée, ce qui est juste : il empêche deux
     * initialisations concurrentes. Mais il n'était libéré NULLE PART — ni
     * `catch`, ni `finally`. Une auto-connexion qui échouait (jeton expiré,
     * réseau indisponible) laissait le loquet revendiqué : la connexion
     * n'était **plus jamais** retentée tant que le composant vivait, et rien
     * ne le signalait.
     *
     * Même forme que `useProjectAiTranscriptHydration`, qui pose le loquet à
     * l'entrée puis le relâche dans son `catch` — « a returning user with a
     * real (but transiently unreachable) transcript must never be left with a
     * silently-empty chat panel ».
     */
    initializeConnection().catch((error) => {
      hasInitialized.current = false;
      console.error('Vercel: initialisation échouée, loquet libéré pour un nouvel essai', error);
    });
  }, []); // Empty dependency array to run only once

  const handleConnect = async (event: React.FormEvent) => {
    event.preventDefault();
    isConnecting.set(true);

    try {
      const response = await fetch('https://api.vercel.com/v2/user', {
        headers: {
          Authorization: `Bearer ${connection.token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(t('settings.copy.invalidTokenOrUnauthorized_8599db09'));
      }

      const userData = (await response.json()) as any;
      updateVercelConnection({
        user: userData.user || userData, // Handle both possible structures
        token: connection.token,
      });

      await fetchVercelStats(connection.token);
      toast.success(t('settings.copy.successfullyConnectedToVercel_b11bdb69'));
    } catch (error) {
      console.error('Auth error:', error);
      logStore.logError(t('settings.vercel.authenticationFailed'), { error });
      toast.error(t('settings.copy.failedToConnectToVercel_13100f98'));
      updateVercelConnection({ user: null, token: '' });
    } finally {
      isConnecting.set(false);
    }
  };

  const handleDisconnect = () => {
    updateVercelConnection({ user: null, token: '' });
    toast.success(t('settings.copy.disconnectedFromVercel_f567b00a'));
  };

  console.log('connection', connection);

  return (
    <motion.div
      className="bg-bolt-elements-background-depth-2 rounded-lg border border-bolt-elements-borderColor"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
    >
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img
              className="w-5 h-5 dark:invert"
              height="24"
              width="24"
              crossOrigin="anonymous"
              src={`https://cdn.simpleicons.org/vercel/black`}
            />
            <h3 className="text-base font-medium text-bolt-elements-textPrimary">
              {t('settings.copy.vercelConnection_197535ea')}
            </h3>
          </div>
        </div>

        {!connection.user ? (
          <div className="space-y-4">
            <div>
              <label htmlFor="vercel-access-token" className="block text-sm text-bolt-elements-textSecondary mb-2">
                {t('settings.copy.personalAccessToken_5572fccc')}
              </label>
              <input
                id="vercel-access-token"
                type="password"
                value={connection.token}
                onChange={(e) => updateVercelConnection({ ...connection, token: e.target.value })}
                disabled={connecting}
                placeholder={t('settings.copy.enterYourVercelPersonalAccessToken_b1562395')}
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
                  href="https://vercel.com/account/tokens"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-bolt-elements-borderColorActive hover:underline inline-flex items-center gap-1"
                >
                  {t('settings.copy.getYourToken_41c867bf')}
                  <div className="i-ph:arrow-square-out w-4 h-4" />
                </a>
                <div className="mt-2 text-xs text-bolt-elements-textSecondary bg-bolt-elements-background-depth-1 p-2 rounded">
                  <p className="flex items-center gap-1">
                    <span className="i-ph:lightbulb w-3.5 h-3.5 text-bolt-elements-icon-success" />
                    <span className="font-medium">{t('settings.copy.tip_ab744fe2')}</span>{' '}
                    {t('settings.copy.youCanAlsoSet_dcbb043f')}{' '}
                    <code className="px-1 py-0.5 bg-bolt-elements-background-depth-2 rounded text-xs">
                      VITE_VERCEL_ACCESS_TOKEN
                    </code>{' '}
                    {t('settings.copy.inYourEnvLocalForAutomaticConnection_aaddd8e9')}
                  </p>
                </div>
                {/* Debug info — dev-only (was leaking internal token state into the prod UI). */}
                {import.meta.env?.DEV && (
                  <div className="mt-2 text-xs text-bolt-elements-textTertiary">
                    <p>
                      {t('settings.copy.debugTokenPresent_55c6fdda')} {connection.token ? '✅' : '❌'}
                    </p>
                    <p>
                      {t('settings.copy.debugUserPresent_b0ff1699')} {connection.user ? '✅' : '❌'}
                    </p>
                    <p>
                      {t('settings.copy.debugEnvToken_21052265')}{' '}
                      {import.meta.env?.VITE_VERCEL_ACCESS_TOKEN ? '✅' : '❌'}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleConnect}
                disabled={connecting || !connection.token}
                className={classNames(
                  'px-4 py-2 rounded-lg text-sm flex items-center gap-2',
                  'bg-[var(--vc-ide-accent-action)] text-white',
                  'hover:opacity-90 hover:text-white',
                  'disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200',
                  'transform active:scale-95',
                )}
              >
                {connecting ? (
                  <>
                    <div className="i-ph:spinner-gap animate-spin" />
                    {t('settings.copy.connecting_5f04ae9e')}
                  </>
                ) : (
                  <>
                    <div className="i-ph:plug-charging w-4 h-4" />
                    {t('settings.copy.connect_1a2303ed')}
                  </>
                )}
              </button>

              {/* Debug button — dev-only (was shipped in the production settings UI). */}
              {import.meta.env?.DEV && (
                <button
                  onClick={async () => {
                    console.log('Manual auto-connect test');

                    const result = await autoConnectVercel();

                    if (result.success) {
                      toast.success(t('settings.copy.manualAutoConnectSuccessful_d99f22b3'));
                    } else {
                      console.error('Manual Vercel auto-connect failed', result.error);
                      toast.error(t('settings.vercel.autoConnectFailed'));
                    }
                  }}
                  className="px-3 py-2 rounded-lg text-xs bg-blue-500 text-white hover:bg-blue-600"
                >
                  {t('settings.copy.testAutoConnect_bf008333')}
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={handleDisconnect}
                  className={classNames(
                    'px-4 py-2 rounded-lg text-sm flex items-center gap-2',
                    'bg-red-500 text-white',
                    'hover:bg-red-600',
                  )}
                >
                  <div className="i-ph:plug w-4 h-4" />
                  {t('settings.copy.disconnect_acfc5be7')}
                </button>
                <span className="text-sm text-bolt-elements-textSecondary flex items-center gap-1">
                  <div className="i-ph:check-circle w-4 h-4 text-green-500" />
                  {t('settings.copy.connectedToVercel_699b4165')}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-4 p-4 bg-bolt-elements-background-depth-3 rounded-lg">
              {/* Debug output */}
              <pre className="hidden">{JSON.stringify(connection.user, null, 2)}</pre>

              <img
                src={`https://vercel.com/api/www/avatar?u=${connection.user?.username || connection.user?.user?.username}`}
                referrerPolicy="no-referrer"
                crossOrigin="anonymous"
                alt={t('settings.copy.userAvatar_2a87bfe3')}
                className="w-12 h-12 rounded-full border-2 border-bolt-elements-borderColorActive"
              />
              <div>
                <h4 className="text-sm font-medium text-bolt-elements-textPrimary">
                  {connection.user?.username || connection.user?.user?.username || t('settings.vercel.user')}
                </h4>
                <p className="text-sm text-bolt-elements-textSecondary">
                  {connection.user?.email || connection.user?.user?.email || t('settings.vercel.noEmail')}
                </p>
              </div>
            </div>

            {fetchingStats ? (
              <div className="flex items-center gap-2 text-sm text-bolt-elements-textSecondary">
                <div className="i-ph:spinner-gap w-4 h-4 animate-spin" />
                {t('settings.copy.fetchingVercelProjects_a1e62108')}
              </div>
            ) : (
              <div>
                <button
                  onClick={() => setIsProjectsExpanded(!isProjectsExpanded)}
                  className="w-full bg-transparent text-left text-sm font-medium text-bolt-elements-textPrimary mb-3 flex items-center gap-2"
                >
                  <div className="i-ph:buildings w-4 h-4" />
                  {t('settings.copy.yourProjects_638a3b27')}
                  {connection.stats?.totalProjects || 0})
                  <div
                    className={classNames(
                      'i-ph:caret-down w-4 h-4 ml-auto transition-transform',
                      isProjectsExpanded ? 'rotate-180' : '',
                    )}
                  />
                </button>
                {isProjectsExpanded && connection.stats?.projects?.length ? (
                  <div className="grid gap-3">
                    {connection.stats.projects.map((project) => (
                      <a
                        key={project.id}
                        href={`https://vercel.com/dashboard/${project.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block p-4 rounded-lg border border-bolt-elements-borderColor hover:border-bolt-elements-borderColorActive transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <h5 className="text-sm font-medium text-bolt-elements-textPrimary flex items-center gap-2">
                              <div className="i-ph:globe w-4 h-4 text-bolt-elements-borderColorActive" />
                              {project.name}
                            </h5>
                            <div className="flex items-center gap-2 mt-2 text-xs text-bolt-elements-textSecondary">
                              {project.targets?.production?.alias && project.targets.production.alias.length > 0 ? (
                                <>
                                  <a
                                    href={`https://${project.targets.production.alias.find((a: string) => a.endsWith('.vercel.app') && !a.includes('-projects.vercel.app')) || project.targets.production.alias[0]}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="hover:text-bolt-elements-borderColorActive"
                                  >
                                    {project.targets.production.alias.find(
                                      (a: string) => a.endsWith('.vercel.app') && !a.includes('-projects.vercel.app'),
                                    ) || project.targets.production.alias[0]}
                                  </a>
                                  <span>•</span>
                                  <span className="flex items-center gap-1">
                                    <div className="i-ph:clock w-3 h-3" />
                                    {new Date(project.createdAt).toLocaleDateString(language)}
                                  </span>
                                </>
                              ) : project.latestDeployments && project.latestDeployments.length > 0 ? (
                                <>
                                  <a
                                    href={`https://${project.latestDeployments[0].url}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="hover:text-bolt-elements-borderColorActive"
                                  >
                                    {project.latestDeployments[0].url}
                                  </a>
                                  <span>•</span>
                                  <span className="flex items-center gap-1">
                                    <div className="i-ph:clock w-3 h-3" />
                                    {new Date(project.latestDeployments[0].created).toLocaleDateString(language)}
                                  </span>
                                </>
                              ) : null}
                            </div>
                          </div>
                          {project.framework && (
                            <div className="text-xs text-bolt-elements-textSecondary px-2 py-1 rounded-md bg-bolt-elements-background-depth-4">
                              <span className="flex items-center gap-1">
                                <div className="i-ph:code w-3 h-3" />
                                {project.framework}
                              </span>
                            </div>
                          )}
                        </div>
                      </a>
                    ))}
                  </div>
                ) : isProjectsExpanded ? (
                  <div className="text-sm text-bolt-elements-textSecondary flex items-center gap-2">
                    <div className="i-ph:info w-4 h-4" />
                    {t('settings.copy.noProjectsFoundInYourVercelAccount_95b15497')}
                  </div>
                ) : null}
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
