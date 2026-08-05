import { getApiKeysFromCookie } from '~/lib/api/cookies';
import { webApiErrorResponse, webApiLocaleHeaders } from '~/lib/i18n/catalogs/web-api-routes';
import { json } from '~/lib/json-response';
import { withSecurity } from '~/lib/security';

async function netlifyUserLoader({ request }: { request: Request }) {
  try {
    // Get API keys from cookies (server-side only)
    const cookieHeader = request.headers.get('Cookie');
    const apiKeys = getApiKeysFromCookie(cookieHeader);

    // Try to get Netlify token from various sources
    const netlifyToken = apiKeys.VITE_NETLIFY_ACCESS_TOKEN;

    if (!netlifyToken) {
      return webApiErrorResponse(request, 'NETLIFY_TOKEN_MISSING', 401);
    }

    // Make server-side request to Netlify API
    const response = await fetch('https://api.netlify.com/api/v1/user', {
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: `Bearer ${netlifyToken}`,
        'User-Agent': 'e-code-app',
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        return webApiErrorResponse(request, 'NETLIFY_TOKEN_INVALID', 401);
      }

      console.error('Netlify user request failed:', { status: response.status });
      throw new Error();
    }

    const userData = (await response.json()) as {
      id: string;
      name: string | null;
      email: string;
      avatar_url: string | null;
      full_name: string | null;
    };

    return json(
      {
        id: userData.id,
        name: userData.name,
        email: userData.email,
        avatar_url: userData.avatar_url,
        full_name: userData.full_name,
      },
      { headers: webApiLocaleHeaders(request) },
    );
  } catch (error) {
    console.error('Error fetching Netlify user:', error);
    return webApiErrorResponse(request, 'NETLIFY_USER_FAILED', 503);
  }
}

export const loader = withSecurity(netlifyUserLoader, {
  rateLimit: true,
  allowedMethods: ['GET'],
});

async function netlifyUserAction({ request }: { request: Request }) {
  try {
    const formData = await request.formData();
    const action = formData.get('action');

    // Get API keys from cookies (server-side only)
    const cookieHeader = request.headers.get('Cookie');
    const apiKeys = getApiKeysFromCookie(cookieHeader);

    // Try to get Netlify token from various sources
    const netlifyToken = apiKeys.VITE_NETLIFY_ACCESS_TOKEN;

    if (!netlifyToken) {
      return webApiErrorResponse(request, 'NETLIFY_TOKEN_MISSING', 401);
    }

    if (action === 'get_sites') {
      // Fetch user sites
      const response = await fetch('https://api.netlify.com/api/v1/sites', {
        signal: AbortSignal.timeout(15000),
        headers: {
          Authorization: `Bearer ${netlifyToken}`,
          'Content-Type': 'application/json',
          'User-Agent': 'e-code-app',
        },
      });

      if (!response.ok) {
        console.error('Netlify sites request failed:', { status: response.status });
        throw new Error();
      }

      const sites = (await response.json()) as Array<{
        id: string;
        name: string;
        url: string;
        admin_url: string;
        build_settings: any;
        created_at: string;
        updated_at: string;
      }>;

      return json({
        sites: sites.map((site) => ({
          id: site.id,
          name: site.name,
          url: site.url,
          admin_url: site.admin_url,
          build_settings: site.build_settings,
          created_at: site.created_at,
          updated_at: site.updated_at,
        })),
        totalSites: sites.length,
      });
    }

    return webApiErrorResponse(request, 'NETLIFY_ACTION_INVALID', 400);
  } catch (error) {
    console.error('Error in Netlify user action:', error);
    return webApiErrorResponse(request, 'NETLIFY_REQUEST_FAILED', 503);
  }
}

export const action = withSecurity(netlifyUserAction, {
  rateLimit: true,
  allowedMethods: ['POST'],
});
