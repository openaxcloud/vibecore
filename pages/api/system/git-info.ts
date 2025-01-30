import type { NextApiRequest, NextApiResponse } from 'next';
import { execSync } from 'child_process';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    // Get git information using git commands
    const branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
    const commitHash = execSync('git rev-parse HEAD').toString().trim();
    const commitTime = execSync('git log -1 --format=%cd').toString().trim();
    const author = execSync('git log -1 --format=%an').toString().trim();
    const email = execSync('git log -1 --format=%ae').toString().trim();
    const remoteUrl = execSync('git config --get remote.origin.url').toString().trim();

    // Extract repo name from remote URL
    const repoName = remoteUrl.split('/').pop()?.replace('.git', '') || '';

    const gitInfo = {
      local: {
        commitHash,
        branch,
        commitTime,
        author,
        email,
        remoteUrl,
        repoName,
      },
    };

    return res.status(200).json(gitInfo);
  } catch (error) {
    console.error('Failed to get git information:', error);
    return res.status(500).json({ message: 'Failed to get git information' });
  }
}
