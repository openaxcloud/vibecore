import type { LoaderFunction } from '@remix-run/cloudflare';
import { json } from '@remix-run/cloudflare';
import { execSync } from 'child_process';

interface GitHubRepoInfo {
  name: string;
  full_name: string;
  default_branch: string;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  parent?: {
    full_name: string;
    default_branch: string;
    stargazers_count: number;
    forks_count: number;
  };
}

const getLocalGitInfo = () => {
  try {
    return {
      commitHash: execSync('git rev-parse --short HEAD').toString().trim(),
      branch: execSync('git rev-parse --abbrev-ref HEAD').toString().trim(),
      commitTime: execSync('git log -1 --format=%cd').toString().trim(),
      author: execSync('git log -1 --format=%an').toString().trim(),
      email: execSync('git log -1 --format=%ae').toString().trim(),
      remoteUrl: execSync('git config --get remote.origin.url').toString().trim(),
      repoName: execSync('git config --get remote.origin.url')
        .toString()
        .trim()
        .replace(/^.*github.com[:/]/, '')
        .replace(/\.git$/, ''),
    };
  } catch (error) {
    console.error('Failed to get local git info:', error);
    return null;
  }
};

const getGitHubInfo = async (repoFullName: string) => {
  try {
    const response = await fetch(`https://api.github.com/repos/${repoFullName}`);

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.statusText}`);
    }

    return (await response.json()) as GitHubRepoInfo;
  } catch (error) {
    console.error('Failed to get GitHub info:', error);
    return null;
  }
};

export const loader: LoaderFunction = async ({ request: _request }) => {
  const localInfo = getLocalGitInfo();

  // If we have local info, try to get GitHub info for both our fork and upstream
  let githubInfo = null;

  if (localInfo?.repoName) {
    githubInfo = await getGitHubInfo(localInfo.repoName);
  }

  // If no local info or GitHub info, try the main repo
  if (!githubInfo) {
    githubInfo = await getGitHubInfo('stackblitz-labs/bolt.diy');
  }

  return json({
    local: localInfo || {
      commitHash: 'unknown',
      branch: 'unknown',
      commitTime: 'unknown',
      author: 'unknown',
      email: 'unknown',
      remoteUrl: 'unknown',
      repoName: 'unknown',
    },
    github: githubInfo
      ? {
          currentRepo: {
            fullName: githubInfo.full_name,
            defaultBranch: githubInfo.default_branch,
            stars: githubInfo.stargazers_count,
            forks: githubInfo.forks_count,
            openIssues: githubInfo.open_issues_count,
          },
          upstream: githubInfo.parent
            ? {
                fullName: githubInfo.parent.full_name,
                defaultBranch: githubInfo.parent.default_branch,
                stars: githubInfo.parent.stargazers_count,
                forks: githubInfo.parent.forks_count,
              }
            : null,
        }
      : null,
    isForked: Boolean(githubInfo?.parent),
    timestamp: new Date().toISOString(),
  });
};
