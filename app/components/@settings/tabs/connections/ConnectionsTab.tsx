import React, { useState, useEffect } from 'react';
import { logStore } from '~/lib/stores/logs';
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
        <GithubConnection />
        {/* Netlify Connection */}
        <NetlifyConnection />
      </div>
    </div>
  );
}
