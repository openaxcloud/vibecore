import { execFile } from 'node:child_process';
import { type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router';
import { requireWebSession } from '~/lib/.server/require-session';
import {
  formatApiRuntimeRoutesCopy,
  getApiRuntimeRoutesCopy,
  type ApiRuntimeRoutesCopy,
} from '~/lib/i18n/catalogs/api-runtime-routes';
import { localeResponseHeaders, resolveRequestLocale } from '~/lib/i18n/request-locale';
import { json } from '~/lib/json-response';
import { withSecurity } from '~/lib/security';

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

/*
 * git parses options anywhere on the command line, so a branch value starting
 * with `-` (e.g. `--upload-pack=<cmd>`) is consumed as an option rather than a
 * refspec — an argument-injection → RCE on the spliced `git fetch upstream
 * <branch>` / `rev-parse upstream/<branch>` calls. Restrict the branch to a
 * conservative git-ref charset, forbid leading dashes and `..`, before it ever
 * reaches execFile.
 */
function assertSafeBranch(branch: string): string {
  const valid = /^[A-Za-z0-9](?:[A-Za-z0-9._/-]*[A-Za-z0-9_])?$/.test(branch) && !branch.includes('..');

  if (!valid) {
    throw Object.assign(new Error(), { code: 'INVALID_BRANCH' });
  }

  return branch;
}

async function collectUpdateDetails(rawBranch: string, copy: ApiRuntimeRoutesCopy) {
  const branch = assertSafeBranch(rawBranch);
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

          const key =
            status === 'A'
              ? 'apiRuntime.update.fileAdded'
              : status === 'D'
                ? 'apiRuntime.update.fileDeleted'
                : 'apiRuntime.update.fileModified';

          return formatApiRuntimeRoutesCopy(copy[key], { file });
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

/*
 * /api/update is a local self-update helper: every hit forks a chain of git
 * subprocesses and the loader runs `git fetch upstream <branch>` (outbound
 * network). Left anonymous it is a cheap subprocess/network DoS vector and
 * leaks host repo topology (changed files + commit messages). Mirror the
 * sibling api.system.disk-info route: gate behind a valid web session (fails
 * closed with a 401/503 Response) and apply withSecurity rate limiting +
 * method allowlisting. requireWebSession's auth Response is surfaced as-is so
 * withSecurity's catch does not rewrite it into a generic 500.
 */
async function updateLoaderHandler({ request }: LoaderFunctionArgs): Promise<Response> {
  const localeResolution = resolveRequestLocale(request);
  const copy = getApiRuntimeRoutesCopy(localeResolution.language);

  try {
    await requireWebSession(request);
  } catch (authResponse) {
    if (authResponse instanceof Response) {
      const message =
        authResponse.status === 503
          ? copy['apiRuntime.generic.authenticationUnavailable']
          : copy['apiRuntime.generic.authenticationRequired'];

      return json({ error: message, code: 'AUTH_REQUIRED' }, { status: authResponse.status });
    }

    throw authResponse;
  }

  const url = new URL(request.url);
  const branch = url.searchParams.get('branch') || 'main';

  try {
    const details = await collectUpdateDetails(branch, copy);

    return json({
      stage: 'complete',
      message: details.updateReady ? copy['apiRuntime.update.available'] : copy['apiRuntime.update.upToDate'],
      progress: 100,
      details: {
        ...details,
        changelog: details.updateReady ? copy['apiRuntime.update.review'] : copy['apiRuntime.update.none'],
      },
    });
  } catch (error) {
    console.error('Update check failed:', error);

    const message =
      (error as { code?: string } | undefined)?.code === 'INVALID_BRANCH'
        ? copy['apiRuntime.update.invalidBranch']
        : copy['apiRuntime.generic.requestFailed'];

    return json(
      { stage: 'complete', message: copy['apiRuntime.update.checkFailed'], progress: 100, error: message },
      { status: 500 },
    );
  }
}

async function updateActionHandler({ request }: ActionFunctionArgs): Promise<Response> {
  const localeResolution = resolveRequestLocale(request);
  const copy = getApiRuntimeRoutesCopy(localeResolution.language);

  try {
    await requireWebSession(request);
  } catch (authResponse) {
    if (authResponse instanceof Response) {
      const message =
        authResponse.status === 503
          ? copy['apiRuntime.generic.authenticationUnavailable']
          : copy['apiRuntime.generic.authenticationRequired'];

      return json({ error: message, code: 'AUTH_REQUIRED' }, { status: authResponse.status });
    }

    throw authResponse;
  }

  const { branch = 'main', autoUpdate = false } = (await request.json().catch(() => ({}))) as {
    branch?: string;
    autoUpdate?: boolean;
  };

  const stream = new TransformStream<Uint8Array, Uint8Array>();
  const writer = stream.writable.getWriter();

  // Used to swallow stream-write/close rejections (see controller comment below).
  const ignoreStreamError = () => undefined;

  const controller = {
    /*
     * Swallow write rejections: if the client aborts/closes the response
     * mid-stream the underlying writer.write() rejects, and because every
     * writeProgress() call floats this promise an unhandled rejection would
     * crash the Node server process. The background IIFE still relies on
     * collectUpdateDetails() to surface real errors via writeProgress.
     */
    enqueue: (chunk: Uint8Array) => {
      writer.write(chunk).catch(ignoreStreamError);
    },
  } as unknown as TransformStreamDefaultController<Uint8Array>;

  void (async () => {
    try {
      writeProgress(controller, {
        stage: 'fetch',
        message: formatApiRuntimeRoutesCopy(copy['apiRuntime.update.checking'], { branch }),
        progress: 15,
      });

      const details = await collectUpdateDetails(branch, copy);

      if (autoUpdate && details.updateReady) {
        writeProgress(controller, {
          stage: 'pull',
          message: copy['apiRuntime.update.manualApply'],
          progress: 100,
          error: copy['apiRuntime.update.automaticDisabled'],
          details: {
            ...details,
          },
        });
      }

      writeProgress(controller, {
        stage: 'complete',
        message: details.updateReady ? copy['apiRuntime.update.available'] : copy['apiRuntime.update.upToDate'],
        progress: 100,
        details: {
          ...details,
          changelog: details.updateReady ? copy['apiRuntime.update.review'] : copy['apiRuntime.update.none'],
        },
      });
    } catch (error) {
      console.error('Streaming update check failed:', error);

      const message =
        (error as { code?: string } | undefined)?.code === 'INVALID_BRANCH'
          ? copy['apiRuntime.update.invalidBranch']
          : copy['apiRuntime.generic.requestFailed'];

      writeProgress(controller, {
        stage: 'complete',
        message: copy['apiRuntime.update.checkFailed'],
        progress: 100,
        error: message,
      });
    } finally {
      /*
       * close() also rejects if the client already aborted the stream; swallow
       * it so the void-ed IIFE never produces an unhandled rejection.
       */
      await writer.close().catch(ignoreStreamError);
    }
  })();

  return new Response(stream.readable, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  });
}

const securedLoader = withSecurity(updateLoaderHandler, {
  rateLimit: true,
  allowedMethods: ['GET'],
});

const securedAction = withSecurity(updateActionHandler, {
  rateLimit: true,
  allowedMethods: ['POST'],
});

async function localizeSecurityResponse(request: Request, response: Response): Promise<Response> {
  const localeResolution = resolveRequestLocale(request);
  const copy = getApiRuntimeRoutesCopy(localeResolution.language);
  const headers = localeResponseHeaders(request, localeResolution);

  response.headers.forEach((value, key) => headers.set(key, value));

  const wrappedSecurityFailure =
    response.status === 500 &&
    (await response
      .clone()
      .json()
      .then((payload: unknown) => (payload as { error?: unknown } | null)?.error === true)
      .catch(() => false));

  if (response.status === 405 || response.status === 429 || wrappedSecurityFailure) {
    const message =
      response.status === 405
        ? copy['apiRuntime.generic.methodNotAllowed']
        : response.status === 429
          ? copy['apiRuntime.generic.rateLimit']
          : copy['apiRuntime.generic.requestFailed'];

    return json({ error: message }, { status: response.status, headers });
  }

  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export async function loader(args: LoaderFunctionArgs): Promise<Response> {
  return localizeSecurityResponse(args.request, await securedLoader(args));
}

export async function action(args: ActionFunctionArgs): Promise<Response> {
  return localizeSecurityResponse(args.request, await securedAction(args));
}
