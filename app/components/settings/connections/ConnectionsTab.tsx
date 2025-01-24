import React, { useState, useEffect } from 'react';
import { logStore } from '~/lib/stores/logs';
import { classNames } from '~/utils/classNames';
import { motion } from 'framer-motion';
import { toast } from 'react-toastify';

interface GitHubUserResponse {
  login: string;
  avatar_url: string;
  html_url: string;
  name: string;
  bio: string;
  public_repos: number;
  followers: number;
  following: number;
}

interface GitHubRepoInfo {
  name: string;
  full_name: string;
  html_url: string;
  description: string;
  stargazers_count: number;
  forks_count: number;
  default_branch: string;
  updated_at: string;
}

interface GitHubStats {
  repos: GitHubRepoInfo[];
  totalStars: number;
  totalForks: number;
}

interface GitHubConnection {
  user: GitHubUserResponse | null;
  token: string;
  tokenType: 'classic' | 'fine-grained';
  stats?: GitHubStats;
}

export default function ConnectionsTab() {
  const [connection, setConnection] = useState<GitHubConnection>({
    user: null,
    token: '',
    tokenType: 'classic',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isFetchingStats, setIsFetchingStats] = useState(false);

  // Load saved connection on mount
  useEffect(() => {
    const savedConnection = localStorage.getItem('github_connection');

    if (savedConnection) {
      const parsed = JSON.parse(savedConnection);

      // Ensure backward compatibility with existing connections
      if (!parsed.tokenType) {
        parsed.tokenType = 'classic';
      }

      setConnection(parsed);

      if (parsed.user && parsed.token) {
        fetchGitHubStats(parsed.token);
      }
    }

    setIsLoading(false);
  }, []);

  const fetchGitHubStats = async (token: string) => {
    try {
      setIsFetchingStats(true);

      // Fetch repositories
      const reposResponse = await fetch('https://api.github.com/user/repos?sort=updated&per_page=10', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!reposResponse.ok) {
        throw new Error('Failed to fetch repositories');
      }

      const repos = (await reposResponse.json()) as GitHubRepoInfo[];

      // Calculate total stats
      const totalStars = repos.reduce((acc, repo) => acc + repo.stargazers_count, 0);
      const totalForks = repos.reduce((acc, repo) => acc + repo.forks_count, 0);

      setConnection((prev) => ({
        ...prev,
        stats: {
          repos,
          totalStars,
          totalForks,
        },
      }));
    } catch (error) {
      logStore.logError('Failed to fetch GitHub stats', { error });
      toast.error('Failed to fetch GitHub statistics');
    } finally {
      setIsFetchingStats(false);
    }
  };

  const fetchGithubUser = async (token: string) => {
    try {
      setIsConnecting(true);

      const response = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Invalid token or unauthorized');
      }

      const data = (await response.json()) as GitHubUserResponse;
      const newConnection: GitHubConnection = {
        user: data,
        token,
        tokenType: connection.tokenType,
      };

      // Save connection
      localStorage.setItem('github_connection', JSON.stringify(newConnection));
      setConnection(newConnection);

      // Fetch additional stats
      await fetchGitHubStats(token);

      toast.success('Successfully connected to GitHub');
    } catch (error) {
      logStore.logError('Failed to authenticate with GitHub', { error });
      toast.error('Failed to connect to GitHub');
      setConnection({ user: null, token: '', tokenType: 'classic' });
    } finally {
      setIsConnecting(false);
    }
  };

  const handleConnect = async (event: React.FormEvent) => {
    event.preventDefault();
    await fetchGithubUser(connection.token);
  };

  const handleDisconnect = () => {
    localStorage.removeItem('github_connection');
    setConnection({ user: null, token: '', tokenType: 'classic' });
    toast.success('Disconnected from GitHub');
  };

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <motion.div
        className="flex items-center gap-2 mb-2"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <div className="i-ph:plugs-connected w-5 h-5 text-purple-500" />
        <h2 className="text-lg font-medium text-bolt-elements-textPrimary">Connection Settings</h2>
      </motion.div>
      <p className="text-sm text-bolt-elements-textSecondary mb-6">
        Manage your external service connections and integrations
      </p>

      <div className="grid grid-cols-1 gap-4">
        {/* GitHub Connection */}
        <motion.div
          className="bg-[#FFFFFF] dark:bg-[#0A0A0A] rounded-lg border border-[#E5E5E5] dark:border-[#1A1A1A]"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="p-6 space-y-6">
            <div className="flex items-center gap-2">
              <div className="i-ph:github-logo w-5 h-5 text-bolt-elements-textPrimary" />
              <h3 className="text-base font-medium text-bolt-elements-textPrimary">GitHub Connection</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-bolt-elements-textSecondary mb-2">Token Type</label>
                <select
                  value={connection.tokenType}
                  onChange={(e) =>
                    setConnection((prev) => ({ ...prev, tokenType: e.target.value as 'classic' | 'fine-grained' }))
                  }
                  disabled={isConnecting || !!connection.user}
                  className={classNames(
                    'w-full px-3 py-2 rounded-lg text-sm',
                    'bg-[#F8F8F8] dark:bg-[#1A1A1A]',
                    'border border-[#E5E5E5] dark:border-[#333333]',
                    'text-bolt-elements-textPrimary',
                    'focus:outline-none focus:ring-1 focus:ring-purple-500',
                    'disabled:opacity-50',
                  )}
                >
                  <option value="classic">Personal Access Token (Classic)</option>
                  <option value="fine-grained">Fine-grained Token</option>
                </select>
              </div>

              <div>
                <label className="block text-sm text-bolt-elements-textSecondary mb-2">
                  {connection.tokenType === 'classic' ? 'Personal Access Token' : 'Fine-grained Token'}
                </label>
                <input
                  type="password"
                  value={connection.token}
                  onChange={(e) => setConnection((prev) => ({ ...prev, token: e.target.value }))}
                  disabled={isConnecting || !!connection.user}
                  placeholder={`Enter your GitHub ${connection.tokenType === 'classic' ? 'personal access token' : 'fine-grained token'}`}
                  className={classNames(
                    'w-full px-3 py-2 rounded-lg text-sm',
                    'bg-[#F8F8F8] dark:bg-[#1A1A1A]',
                    'border border-[#E5E5E5] dark:border-[#333333]',
                    'text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary',
                    'focus:outline-none focus:ring-1 focus:ring-purple-500',
                    'disabled:opacity-50',
                  )}
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              {!connection.user ? (
                <button
                  onClick={handleConnect}
                  disabled={isConnecting || !connection.token}
                  className={classNames(
                    'px-4 py-2 rounded-lg text-sm flex items-center gap-2',
                    'bg-purple-500 text-white',
                    'hover:bg-purple-600',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                  )}
                >
                  {isConnecting ? (
                    <>
                      <div className="i-ph:spinner-gap animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <div className="i-ph:plug-charging w-4 h-4" />
                      Connect
                    </>
                  )}
                </button>
              ) : (
                <button
                  onClick={handleDisconnect}
                  className={classNames(
                    'px-4 py-2 rounded-lg text-sm flex items-center gap-2',
                    'bg-red-500 text-white',
                    'hover:bg-red-600',
                  )}
                >
                  <div className="i-ph:plug-x w-4 h-4" />
                  Disconnect
                </button>
              )}

              {connection.user && (
                <span className="text-sm text-bolt-elements-textSecondary flex items-center gap-1">
                  <div className="i-ph:check-circle w-4 h-4" />
                  Connected to GitHub
                </span>
              )}
            </div>

            {connection.user && (
              <div className="p-4 bg-[#F8F8F8] dark:bg-[#1A1A1A] rounded-lg">
                <div className="flex items-center gap-4">
                  <img
                    src={connection.user.avatar_url}
                    alt={connection.user.login}
                    className="w-12 h-12 rounded-full"
                  />
                  <div>
                    <h4 className="text-sm font-medium text-bolt-elements-textPrimary">{connection.user.name}</h4>
                    <p className="text-sm text-bolt-elements-textSecondary">@{connection.user.login}</p>
                  </div>
                </div>

                {isFetchingStats ? (
                  <div className="mt-4 flex items-center gap-2 text-sm text-bolt-elements-textSecondary">
                    <div className="i-ph:spinner-gap w-4 h-4 animate-spin" />
                    Fetching GitHub stats...
                  </div>
                ) : (
                  connection.stats && (
                    <div className="mt-4 grid grid-cols-3 gap-4">
                      <div>
                        <p className="text-sm text-bolt-elements-textSecondary">Public Repos</p>
                        <p className="text-lg font-medium text-bolt-elements-textPrimary">
                          {connection.user.public_repos}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-bolt-elements-textSecondary">Total Stars</p>
                        <p className="text-lg font-medium text-bolt-elements-textPrimary">
                          {connection.stats.totalStars}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-bolt-elements-textSecondary">Total Forks</p>
                        <p className="text-lg font-medium text-bolt-elements-textPrimary">
                          {connection.stats.totalForks}
                        </p>
                      </div>
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center p-4">
      <div className="flex items-center gap-2">
        <div className="i-ph:spinner-gap-bold animate-spin w-4 h-4" />
        <span className="text-bolt-elements-textSecondary">Loading...</span>
      </div>
    </div>
  );
}
