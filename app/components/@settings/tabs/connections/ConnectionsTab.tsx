import React, { useState, useEffect } from 'react';
import { logStore } from '~/lib/stores/logs';
import { classNames } from '~/utils/classNames';
import { motion } from 'framer-motion';
import { toast } from 'react-toastify';
import { GithubConnection } from './GithubConnection';
import { NetlifyConnection } from './NetlifyConnection';

interface GitHubUserResponse {
  login: string;
  avatar_url: string;
  html_url: string;
  name: string;
  bio: string;
  public_repos: number;
  followers: number;
  following: number;
  created_at: string;
  public_gists: number;
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
  languages_url: string;
}

interface GitHubOrganization {
  login: string;
  avatar_url: string;
  html_url: string;
}

interface GitHubEvent {
  id: string;
  type: string;
  repo: {
    name: string;
  };
  created_at: string;
}

interface GitHubLanguageStats {
  [language: string]: number;
}

interface GitHubStats {
  repos: GitHubRepoInfo[];
  totalStars: number;
  totalForks: number;
  organizations: GitHubOrganization[];
  recentActivity: GitHubEvent[];
  languages: GitHubLanguageStats;
  totalGists: number;
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

      // Fetch repositories - only owned by the authenticated user
      const reposResponse = await fetch(
        'https://api.github.com/user/repos?sort=updated&per_page=10&affiliation=owner,organization_member,collaborator',
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (!reposResponse.ok) {
        throw new Error('Failed to fetch repositories');
      }

      const repos = (await reposResponse.json()) as GitHubRepoInfo[];

      // Fetch organizations
      const orgsResponse = await fetch('https://api.github.com/user/orgs', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!orgsResponse.ok) {
        throw new Error('Failed to fetch organizations');
      }

      const organizations = (await orgsResponse.json()) as GitHubOrganization[];

      // Fetch recent activity
      const eventsResponse = await fetch('https://api.github.com/users/' + connection.user?.login + '/events/public', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!eventsResponse.ok) {
        throw new Error('Failed to fetch events');
      }

      const recentActivity = ((await eventsResponse.json()) as GitHubEvent[]).slice(0, 5);

      // Fetch languages for each repository
      const languagePromises = repos.map((repo) =>
        fetch(repo.languages_url, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }).then((res) => res.json() as Promise<Record<string, number>>),
      );

      const repoLanguages = await Promise.all(languagePromises);
      const languages: GitHubLanguageStats = {};

      repoLanguages.forEach((repoLang) => {
        Object.entries(repoLang).forEach(([lang, bytes]) => {
          languages[lang] = (languages[lang] || 0) + bytes;
        });
      });

      // Calculate total stats
      const totalStars = repos.reduce((acc, repo) => acc + repo.stargazers_count, 0);
      const totalForks = repos.reduce((acc, repo) => acc + repo.forks_count, 0);
      const totalGists = connection.user?.public_gists || 0;

      setConnection((prev) => ({
        ...prev,
        stats: {
          repos,
          totalStars,
          totalForks,
          organizations,
          recentActivity,
          languages,
          totalGists,
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
        <GithubConnection/>
        {/* Netlify Connection */}
        <NetlifyConnection/>
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
