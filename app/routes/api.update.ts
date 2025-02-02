import { json } from '@remix-run/node';
import type { ActionFunction } from '@remix-run/node';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface UpdateRequestBody {
  branch: string;
}

interface UpdateProgress {
  stage: 'fetch' | 'pull' | 'install' | 'build' | 'complete';
  message: string;
  progress?: number;
  error?: string;
  details?: {
    changedFiles?: string[];
    additions?: number;
    deletions?: number;
    commitMessages?: string[];
  };
}

export const action: ActionFunction = async ({ request }) => {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const body = await request.json();

    if (!body || typeof body !== 'object' || !('branch' in body) || typeof body.branch !== 'string') {
      return json({ error: 'Invalid request body: branch is required and must be a string' }, { status: 400 });
    }

    const { branch } = body as UpdateRequestBody;

    // Create a ReadableStream to send progress updates
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const sendProgress = (update: UpdateProgress) => {
          controller.enqueue(encoder.encode(JSON.stringify(update) + '\n'));
        };

        try {
          // Fetch stage
          sendProgress({
            stage: 'fetch',
            message: 'Fetching latest changes...',
            progress: 0,
          });

          // Get current commit hash
          const { stdout: currentCommit } = await execAsync('git rev-parse HEAD');

          // Fetch changes
          await execAsync('git fetch origin');

          // Get list of changed files
          const { stdout: diffOutput } = await execAsync(`git diff --name-status origin/${branch}`);
          const changedFiles = diffOutput
            .split('\n')
            .filter(Boolean)
            .map((line) => {
              const [status, file] = line.split('\t');
              return `${status === 'M' ? 'Modified' : status === 'A' ? 'Added' : 'Deleted'}: ${file}`;
            });

          // Get commit messages
          const { stdout: logOutput } = await execAsync(`git log --oneline ${currentCommit.trim()}..origin/${branch}`);
          const commitMessages = logOutput.split('\n').filter(Boolean);

          // Get diff stats
          const { stdout: diffStats } = await execAsync(`git diff --shortstat origin/${branch}`);
          const stats = diffStats.match(
            /(\d+) files? changed(?:, (\d+) insertions?\\(\\+\\))?(?:, (\d+) deletions?\\(-\\))?/,
          );

          sendProgress({
            stage: 'fetch',
            message: 'Changes detected',
            progress: 100,
            details: {
              changedFiles,
              additions: stats?.[2] ? parseInt(stats[2]) : 0,
              deletions: stats?.[3] ? parseInt(stats[3]) : 0,
              commitMessages,
            },
          });

          // Pull stage
          sendProgress({
            stage: 'pull',
            message: `Pulling changes from ${branch}...`,
            progress: 0,
          });

          await execAsync(`git pull origin ${branch}`);

          sendProgress({
            stage: 'pull',
            message: 'Changes pulled successfully',
            progress: 100,
          });

          // Install stage
          sendProgress({
            stage: 'install',
            message: 'Installing dependencies...',
            progress: 0,
          });

          await execAsync('pnpm install');

          sendProgress({
            stage: 'install',
            message: 'Dependencies installed successfully',
            progress: 100,
          });

          // Build stage
          sendProgress({
            stage: 'build',
            message: 'Building application...',
            progress: 0,
          });

          await execAsync('pnpm build');

          sendProgress({
            stage: 'build',
            message: 'Build completed successfully',
            progress: 100,
          });

          // Complete
          sendProgress({
            stage: 'complete',
            message: 'Update completed successfully! Click Restart to apply changes.',
            progress: 100,
          });
        } catch (error) {
          sendProgress({
            stage: 'complete',
            message: 'Update failed',
            error: error instanceof Error ? error.message : 'Unknown error occurred',
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Update preparation failed:', error);
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred while preparing update',
      },
      { status: 500 },
    );
  }
};
