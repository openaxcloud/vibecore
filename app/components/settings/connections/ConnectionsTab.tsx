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
  stats?: GitHubStats;
}

export default function ConnectionsTab() {
  const [connection, setConnection] = useState<GitHubConnection>({
    user: null,
    token: '',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isFetchingStats, setIsFetchingStats] = useState(false);

  // Load saved connection on mount
  useEffect(() => {
    const savedConnection = localStorage.getItem('github_connection');

    if (savedConnection) {
      const parsed = JSON.parse(savedConnection);
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

      if (!reposResponse.ok) throw new Error('Failed to fetch repositories');

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

      if (!response.ok) throw new Error('Invalid token or unauthorized');

      const data = (await response.json()) as GitHubUserResponse;
      const newConnection = { user: data, token };

      // Save connection
      localStorage.setItem('github_connection', JSON.stringify(newConnection));
      setConnection(newConnection);

      // Fetch additional stats
      await fetchGitHubStats(token);

      toast.success('Successfully connected to GitHub');
    } catch (error) {
      logStore.logError('Failed to authenticate with GitHub', { error });
      toast.error('Failed to connect to GitHub');
      setConnection({ user: null, token: '' });
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
    setConnection({ user: null, token: '' });
    toast.success('Disconnected from GitHub');
  };

  if (isLoading) return <LoadingSpinner />;

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
                <label className="block text-sm text-bolt-elements-textSecondary mb-2">GitHub Username</label>
                <input
                  type="text"
                  value={connection.user?.login || ''}
                  disabled={true}
                  placeholder="Not connected"
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

              <div>
                <label className="block text-sm text-bolt-elements-textSecondary mb-2">Personal Access Token</label>
                <input
                  type="password"
                  value={connection.token}
                  onChange={(e) => setConnection((prev) => ({ ...prev, token: e.target.value }))}
                  disabled={isConnecting || !!connection.user}
                  placeholder="Enter your GitHub token"
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

            {connection.user && connection.stats && (
              <div className="mt-6 border-t border-[#E5E5E5] dark:border-[#1A1A1A] pt-6">
                <div className="flex items-center gap-4 mb-6">
                  <img
                    src={connection.user.avatar_url}
                    alt={connection.user.login}
                    className="w-16 h-16 rounded-full"
                  />
                  <div>
                    <h3 className="text-lg font-medium text-bolt-elements-textPrimary">
                      {connection.user.name || connection.user.login}
                    </h3>
                    {connection.user.bio && (
                      <p className="text-sm text-bolt-elements-textSecondary">{connection.user.bio}</p>
                    )}
                    <div className="flex gap-4 mt-2 text-sm text-bolt-elements-textSecondary">
                      <span className="flex items-center gap-1">
                        <div className="i-ph:users w-4 h-4" />
                        {connection.user.followers} followers
                      </span>
                      <span className="flex items-center gap-1">
                        <div className="i-ph:star w-4 h-4" />
                        {connection.stats.totalStars} stars
                      </span>
                      <span className="flex items-center gap-1">
                        <div className="i-ph:git-fork w-4 h-4" />
                        {connection.stats.totalForks} forks
                      </span>
                    </div>
                  </div>
                </div>

                <h4 className="text-sm font-medium text-bolt-elements-textPrimary mb-3">Recent Repositories</h4>
                <div className="space-y-3">
                  {connection.stats.repos.map((repo) => (
                    <a
                      key={repo.full_name}
                      href={repo.html_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block p-3 rounded-lg bg-[#F8F8F8] dark:bg-[#1A1A1A] hover:bg-[#F0F0F0] dark:hover:bg-[#252525] transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h5 className="text-sm font-medium text-bolt-elements-textPrimary">{repo.name}</h5>
                          {repo.description && (
                            <p className="text-xs text-bolt-elements-textSecondary mt-1">{repo.description}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-bolt-elements-textSecondary">
                          <span className="flex items-center gap-1">
                            <div className="i-ph:star w-3 h-3" />
                            {repo.stargazers_count}
                          </span>
                          <span className="flex items-center gap-1">
                            <div className="i-ph:git-fork w-3 h-3" />
                            {repo.forks_count}
                          </span>
                        </div>
                      </div>
                    </a>
                  ))}
                </div>
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
