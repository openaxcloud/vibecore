import { appPublicEnglish, type AppPublicCopyKey } from './app-public-copy.js';

type PackageAgentTarget = {
  workspaceId: string;
  managerUrl: string;
  agentUrl: string;
  managerSecret?: string;
};

function upstreamError(key: AppPublicCopyKey, statusCode = 502, upstreamStatus?: number) {
  return Object.assign(new Error(appPublicEnglish(key)), {
    code: key,
    statusCode,
    ...(upstreamStatus === undefined ? {} : { upstreamStatus }),
  });
}

/** One authenticated Packages hop. No retry, local execution or workspace lifecycle operation. */
export async function packageAgentHop(
  target: PackageAgentTarget,
  path: string,
  init: RequestInit,
  attempts: number,
  timeoutMs: number,
): Promise<unknown> {
  if (
    attempts !== 1 ||
    !init.signal ||
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs <= 0 ||
    timeoutMs > 330_000 ||
    !(
      (path === '/packages/v1/capabilities' && init.method === 'GET') ||
      (path === '/packages/v1/install' && init.method === 'POST')
    )
  ) {
    throw upstreamError('WORKSPACE_RUNTIME_BAD_RESPONSE');
  }

  const signal = AbortSignal.any([init.signal, AbortSignal.timeout(timeoutMs)]);

  const readBody = async (response: Response): Promise<unknown> => {
    // The fetch signal remains active through the body, not just until headers.
    const text = await response.text();
    signal.throwIfAborted();

    try {
      return JSON.parse(text);
    } catch {
      throw upstreamError('WORKSPACE_RUNTIME_BAD_RESPONSE');
    }
  };

  let token: string;

  try {
    const response = await fetch(
      `${target.managerUrl}/workspaces/${encodeURIComponent(target.workspaceId)}/agent-token`,
      {
        signal,
        headers: {
          accept: 'application/json',
          ...(target.managerSecret ? { authorization: `Bearer ${target.managerSecret}` } : {}),
        },
      },
    );

    if (!response.ok) {
      await response.body?.cancel();
      throw upstreamError('WORKSPACE_MANAGER_REQUEST_FAILED');
    }

    const body = (await readBody(response)) as { token?: unknown } | null;

    if (!body || typeof body.token !== 'string' || !body.token) {
      throw upstreamError('WORKSPACE_RUNTIME_BAD_RESPONSE');
    }

    token = body.token;
  } catch (error) {
    if (signal.aborted) {
      throw upstreamError('STREAM_ABORTED', 499);
    }

    if (error instanceof Error && 'statusCode' in error) {
      throw error;
    }

    throw upstreamError('WORKSPACE_MANAGER_UNAVAILABLE');
  }

  try {
    const response = await fetch(`${target.agentUrl}${path}`, {
      ...init,
      signal,
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/json',
        ...(init.body ? { 'content-type': 'application/json' } : {}),
      },
    });

    if (!response.ok) {
      await response.body?.cancel();

      if (response.status >= 400 && response.status < 500 && ![408, 429].includes(response.status)) {
        throw upstreamError('WORKSPACE_AGENT_CLIENT_ERROR', response.status, response.status);
      }

      throw upstreamError('WORKSPACE_AGENT_REQUEST_FAILED', 502, response.status);
    }

    const body = await readBody(response);

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw upstreamError('WORKSPACE_RUNTIME_BAD_RESPONSE');
    }

    return body;
  } catch (error) {
    if (signal.aborted) {
      throw upstreamError('STREAM_ABORTED', 499);
    }

    if (error instanceof Error && 'statusCode' in error) {
      throw error;
    }

    throw upstreamError('WORKSPACE_AGENT_REQUEST_FAILED');
  }
}
