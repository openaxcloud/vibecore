import { getApiKeysFromCookie } from '~/lib/api/cookies';
import { webApiErrorResponse, webApiLocaleHeaders } from '~/lib/i18n/catalogs/web-api-routes';
import { json } from '~/lib/json-response';
import { withSecurity } from '~/lib/security';

async function vercelUserLoader({ request }: { request: Request }) {
  try {
    // Get API keys from cookies (server-side only)
    const cookieHeader = request.headers.get('Cookie');
    const apiKeys = getApiKeysFromCookie(cookieHeader);

    // Try to get Vercel token from various sources
    let vercelToken = apiKeys.VITE_VERCEL_ACCESS_TOKEN;

    // Also check for token in request headers (for direct API calls)
    if (!vercelToken) {
      const authHeader = request.headers.get('Authorization');

      if (authHeader && authHeader.startsWith('Bearer ')) {
        vercelToken = authHeader.substring(7);
      }
    }

    if (!vercelToken) {
      return webApiErrorResponse(request, 'VERCEL_TOKEN_MISSING', 401);
    }

    // Make server-side request to Vercel API
    const response = await fetch('https://api.vercel.com/v2/user', {
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: `Bearer ${vercelToken}`,
        'User-Agent': 'e-code-app',
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        return webApiErrorResponse(request, 'VERCEL_TOKEN_INVALID', 401);
      }

      console.error('Vercel user request failed:', { status: response.status });
      throw new Error();
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

    return json(
      {
        id: userData.user.id,
        name: userData.user.name,
        email: userData.user.email,
        avatar: userData.user.avatar,
        username: userData.user.username,
      },
      { headers: webApiLocaleHeaders(request) },
    );
  } catch (error) {
    console.error('Error fetching Vercel user:', error);
    return webApiErrorResponse(request, 'VERCEL_USER_FAILED', 503);
  }
}

export const loader = withSecurity(vercelUserLoader, {
  rateLimit: true,
  allowedMethods: ['GET'],
});

async function vercelUserAction({ request }: { request: Request }) {
  try {
    const formData = await request.formData();
    const action = formData.get('action');

    // Get API keys from cookies (server-side only)
    const cookieHeader = request.headers.get('Cookie');
    const apiKeys = getApiKeysFromCookie(cookieHeader);

    // Try to get Vercel token from various sources
    let vercelToken = apiKeys.VITE_VERCEL_ACCESS_TOKEN;

    // Also check for token in request headers (for direct API calls)
    if (!vercelToken) {
      const authHeader = request.headers.get('Authorization');

      if (authHeader && authHeader.startsWith('Bearer ')) {
        vercelToken = authHeader.substring(7);
      }
    }

    if (!vercelToken) {
      return webApiErrorResponse(request, 'VERCEL_TOKEN_MISSING', 401);
    }

    if (action === 'get_projects') {
      // Fetch user projects
      const response = await fetch('https://api.vercel.com/v13/projects', {
        signal: AbortSignal.timeout(15000),
        headers: {
          Authorization: `Bearer ${vercelToken}`,
          'User-Agent': 'e-code-app',
        },
      });

      if (!response.ok) {
        console.error('Vercel projects request failed:', { status: response.status });
        throw new Error();
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

    return webApiErrorResponse(request, 'VERCEL_ACTION_INVALID', 400);
  } catch (error) {
    console.error('Error in Vercel user action:', error);
    return webApiErrorResponse(request, 'VERCEL_REQUEST_FAILED', 503);
  }
}

export const action = withSecurity(vercelUserAction, {
  rateLimit: true,
  allowedMethods: ['POST'],
});
