import { json, type ActionFunction, type LoaderFunction } from '@remix-run/cloudflare';
import { execFile } from 'node:child_process';

type UpdateStage = 'fetch' | 'pull' | 'install' | 'build' | 'complete';

interface UpdateProgress {
  stage: UpdateStage;
  message: string;
  progress: number;
  error?: string;
  details?: {
    changedFiles?: string[];
    additions?: number;
    deletions?: number;
    commitMessages?: string[];
    currentCommit?: string;
    remoteCommit?: string;
    updateReady?: boolean;
    changelog?: string;
    compareUrl?: string;
  };
}

async function git(args: string[]) {
  const stdout = await new Promise<string>((resolve, reject) => {
    execFile(
      'git',
      args,
      {
        cwd: process.cwd(),
        maxBuffer: 1024 * 1024 * 10,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
          return;
        }

        resolve(stdout);
      },
    );
  });

  return stdout.trim();
}

function writeProgress(controller: TransformStreamDefaultController<Uint8Array>, progress: UpdateProgress) {
  controller.enqueue(new TextEncoder().encode(`${JSON.stringify(progress)}\n`));
}

async function collectUpdateDetails(branch: string) {
  await git(['fetch', 'upstream', branch]);

  const currentCommit = await git(['rev-parse', '--short', 'HEAD']);
  const remoteCommit = await git(['rev-parse', '--short', `upstream/${branch}`]);
  const fullCurrentCommit = await git(['rev-parse', 'HEAD']);
  const fullRemoteCommit = await git(['rev-parse', `upstream/${branch}`]);
  const updateReady = fullCurrentCommit !== fullRemoteCommit;

  const changedFiles = updateReady
    ? (await git(['diff', '--name-status', 'HEAD', `upstream/${branch}`]))
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const [status, file] = line.split(/\s+/, 2);
          const label = status === 'A' ? 'Added' : status === 'D' ? 'Deleted' : 'Modified';

          return `${label}: ${file}`;
        })
    : [];

  const numstat = updateReady ? await git(['diff', '--numstat', 'HEAD', `upstream/${branch}`]) : '';
  const totals = numstat.split('\n').reduce(
    (acc, line) => {
      const [additions, deletions] = line.split('\t');
      acc.additions += Number(additions) || 0;
      acc.deletions += Number(deletions) || 0;

      return acc;
    },
    { additions: 0, deletions: 0 },
  );

  const commitMessages = updateReady
    ? (await git(['log', '--oneline', `HEAD..upstream/${branch}`])).split('\n').filter(Boolean)
    : [];
  const repo = await git(['config', '--get', 'remote.upstream.url']).catch(() => '');
  const compareUrl = repo.includes('github.com')
    ? repo
        .replace(/^git@github.com:/, 'https://github.com/')
        .replace(/\.git$/, '')
        .concat(`/compare/${fullCurrentCommit}...${fullRemoteCommit}`)
    : undefined;

  return {
    changedFiles,
    additions: totals.additions,
    deletions: totals.deletions,
    commitMessages,
    currentCommit,
    remoteCommit,
    updateReady,
    compareUrl,
  };
}

export const loader: LoaderFunction = async ({ request }) => {
  const url = new URL(request.url);
  const branch = url.searchParams.get('branch') || 'main';

  try {
    const details = await collectUpdateDetails(branch);

    return json({
      stage: 'complete',
      message: details.updateReady ? 'Update available' : 'You are up to date',
      progress: 100,
      details: {
        ...details,
        changelog: details.updateReady
          ? 'Updates are available. Review the changed files and run git pull manually when ready.'
          : 'No updates found.',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown update check error';

    return json({ stage: 'complete', message: 'Update check failed', progress: 100, error: message }, { status: 500 });
  }
};

export const action: ActionFunction = async ({ request }) => {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { branch = 'main', autoUpdate = false } = (await request.json().catch(() => ({}))) as {
    branch?: string;
    autoUpdate?: boolean;
  };

  const stream = new TransformStream<Uint8Array, Uint8Array>();
  const writer = stream.writable.getWriter();
  const controller = {
    enqueue: (chunk: Uint8Array) => writer.write(chunk),
  } as unknown as TransformStreamDefaultController<Uint8Array>;

  void (async () => {
    try {
      writeProgress(controller, {
        stage: 'fetch',
        message: `Checking upstream/${branch} for updates`,
        progress: 15,
      });

      const details = await collectUpdateDetails(branch);

      if (autoUpdate && details.updateReady) {
        writeProgress(controller, {
          stage: 'pull',
          message: 'Updates are available. Apply them manually from the terminal.',
          progress: 100,
          error: 'Automatic updates are disabled in this local development environment.',
          details: {
            ...details,
          },
        });
      }

      writeProgress(controller, {
        stage: 'complete',
        message: details.updateReady ? 'Update available' : 'You are up to date',
        progress: 100,
        details: {
          ...details,
          changelog: details.updateReady
            ? 'Updates are available. Review the changed files and run git pull manually when ready.'
            : 'No updates found.',
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown update check error';

      writeProgress(controller, {
        stage: 'complete',
        message: 'Update check failed',
        progress: 100,
        error: message,
      });
    } finally {
      await writer.close();
    }
  })();

  return new Response(stream.readable, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  });
};
