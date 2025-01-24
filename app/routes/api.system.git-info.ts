import { json } from '@remix-run/node';
import type { LoaderFunctionArgs } from '@remix-run/node';
import { execSync } from 'child_process';

export async function loader({ request: _request }: LoaderFunctionArgs) {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
    const commit = execSync('git rev-parse --short HEAD').toString().trim();
    const lastCommitMessage = execSync('git log -1 --pretty=%B').toString().trim();

    return json({
      branch,
      commit,
      lastCommitMessage,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return json(
      {
        error: 'Failed to fetch git information',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
