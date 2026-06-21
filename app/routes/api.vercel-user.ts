import { json } from '@remix-run/cloudflare';
import { getApiKeysFromCookie } from '~/lib/api/cookies';
import { apiRequest } from '~/lib/enterprise-api.server';
import { withSecurity } from '~/lib/security';

/*
 * Phase 2 migration mirror of api.github-user.ts: try the
 * UserConnection-backed flow first (the API service decrypts the
 * stored token through packages/security and calls api.vercel.com
 * server-side) and fall back to the legacy cookie / env token when
 * the builder has not yet reconnected through the new flow.
 */

interface VercelUserShape {
  id: string | null;
  username: string | null;
  email: string | null;
  name: string | null;
  avatar: string | null;
}

async function vercelUserLoader({ request, context }: { request: Request; context: any }) {
  try {
    try {
      const upstream = await apiRequest<VercelUserShape>(request, '/api/vercel-user');
      return json(upstream);
    } catch (error) {
      if (!(error instanceof Response) || error.status !== 401) {
        throw error;
      }
    }

    /*
     * Legacy fallback: pull a Vercel PAT from cookies / env until the
     * builder reconnects through the new api-key configure flow.
     */
    const cookieHeader = request.headers.get('Cookie');
    const apiKeys = getApiKeysFromCookie(cookieHeader);

    let vercelToken =
      apiKeys.VITE_VERCEL_ACCESS_TOKEN ||
      context?.cloudflare?.env?.VITE_VERCEL_ACCESS_TOKEN ||
      process.env.VITE_VERCEL_ACCESS_TOKEN;

    if (!vercelToken) {
      const authHeader = request.headers.get('Authorization');

      if (authHeader && authHeader.startsWith('Bearer ')) {
        vercelToken = authHeader.substring(7);
      }
    }

    if (!vercelToken) {
      return json({ error: 'Vercel token not found' }, { status: 401 });
    }

    const response = await fetch('https://api.vercel.com/v2/user', {
      headers: {
        Authorization: `Bearer ${vercelToken}`,
        'User-Agent': 'bolt.diy-app',
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        return json({ error: 'Invalid Vercel token' }, { status: 401 });
      }

      throw new Error(`Vercel API error: ${response.status}`);
    }

    const userData = (await response.json()) as {
      user: {
        id: string;
        name: string | null;
        email: string;
        avatar: string | null;
        username: string;
      };
    };

    return json({
      id: userData.user.id,
      name: userData.user.name,
      email: userData.user.email,
      avatar: userData.user.avatar,
      username: userData.user.username,
    });
  } catch (error) {
    console.error('Error fetching Vercel user:', error);
    return json(
      {
        error: 'Failed to fetch Vercel user information',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

export const loader = withSecurity(vercelUserLoader, {
  rateLimit: true,
  allowedMethods: ['GET'],
});

/*
 * Forwards to the API service's UserConnection-backed /api/vercel-proxy
 * route. Returns the parsed payload on 2xx, returns null when the API
 * answers 401 CONNECTOR_NOT_LINKED so the caller can fall back to the
 * legacy cookie/env token path. Any other failure bubbles up as a
 * thrown Response so the Remix action layer can serialise it.
 */
async function vercelProxyOrNull(
  request: Request,
  payload: {
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    path: string;
    query?: Record<string, string>;
    body?: unknown;
  },
): Promise<unknown | null> {
  try {
    return await apiRequest(request, '/api/vercel-proxy', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  } catch (error) {
    if (error instanceof Response && error.status === 401) {
      const parsed = await error
        .clone()
        .json()
        .catch(() => ({}) as { code?: string });

      if ((parsed as { code?: string }).code === 'CONNECTOR_NOT_LINKED') {
        return null;
      }
    }

    throw error;
  }
}

async function vercelUserAction({ request, context }: { request: Request; context: any }) {
  try {
    const formData = await request.formData();
    const action = formData.get('action');

    if (action === 'get_projects') {
      try {
        const proxied = await vercelProxyOrNull(request, {
          method: 'GET',
          path: '/v13/projects',
        });

        if (proxied !== null) {
          const data = proxied as {
            projects: Array<{
              id: string;
              name: string;
              framework: string | null;
              public: boolean;
              createdAt: string;
              updatedAt: string;
            }>;
          };

          return json({
            projects: data.projects.map((project) => ({
              id: project.id,
              name: project.name,
              framework: project.framework,
              public: project.public,
              createdAt: project.createdAt,
              updatedAt: project.updatedAt,
            })),
            totalProjects: data.projects.length,
          });
        }
      } catch (error) {
        if (error instanceof Response) {
          const parsed = await error
            .clone()
            .json()
            .catch(() => ({}));

          return json(parsed, { status: error.status });
        }

        throw error;
      }
    }

    // Legacy fallback path: cookie / env token.
    const cookieHeader = request.headers.get('Cookie');
    const apiKeys = getApiKeysFromCookie(cookieHeader);

    let vercelToken =
      apiKeys.VITE_VERCEL_ACCESS_TOKEN ||
      context?.cloudflare?.env?.VITE_VERCEL_ACCESS_TOKEN ||
      process.env.VITE_VERCEL_ACCESS_TOKEN;

    if (!vercelToken) {
      const authHeader = request.headers.get('Authorization');

      if (authHeader && authHeader.startsWith('Bearer ')) {
        vercelToken = authHeader.substring(7);
      }
    }

    if (!vercelToken) {
      return json({ error: 'Vercel token not found' }, { status: 401 });
    }

    if (action === 'get_projects') {
      const response = await fetch('https://api.vercel.com/v13/projects', {
        headers: {
          Authorization: `Bearer ${vercelToken}`,
          'User-Agent': 'bolt.diy-app',
        },
      });

      if (!response.ok) {
        throw new Error(`Vercel API error: ${response.status}`);
      }

      const data = (await response.json()) as {
        projects: Array<{
          id: string;
          name: string;
          framework: string | null;
          public: boolean;
          createdAt: string;
          updatedAt: string;
        }>;
      };

      return json({
        projects: data.projects.map((project) => ({
          id: project.id,
          name: project.name,
          framework: project.framework,
          public: project.public,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
        })),
        totalProjects: data.projects.length,
      });
    }

    return json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Error in Vercel user action:', error);
    return json(
      {
        error: 'Failed to process Vercel request',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

export const action = withSecurity(vercelUserAction, {
  rateLimit: true,
  allowedMethods: ['POST'],
});
