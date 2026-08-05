import { getApiKeysFromCookie } from '~/lib/api/cookies';
import { webApiErrorResponse, webApiLocaleHeaders } from '~/lib/i18n/catalogs/web-api-routes';
import { json } from '~/lib/json-response';
import { withSecurity } from '~/lib/security';

async function supabaseUserLoader({ request }: { request: Request }) {
  try {
    // Get API keys from cookies (server-side only)
    const cookieHeader = request.headers.get('Cookie');
    const apiKeys = getApiKeysFromCookie(cookieHeader);

    // Try to get Supabase token from various sources
    const supabaseToken = apiKeys.VITE_SUPABASE_ACCESS_TOKEN;

    if (!supabaseToken) {
      return webApiErrorResponse(request, 'SUPABASE_TOKEN_MISSING', 401);
    }

    // Make server-side request to Supabase API
    const response = await fetch('https://api.supabase.com/v1/projects', {
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: `Bearer ${supabaseToken}`,
        'User-Agent': 'e-code-app',
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        return webApiErrorResponse(request, 'SUPABASE_TOKEN_INVALID', 401);
      }

      console.error('Supabase projects request failed:', { status: response.status });
      throw new Error();
    }

    const projects = (await response.json()) as Array<{
      id: string;
      name: string;
      region: string;
      status: string;
      organization_id: string;
      created_at: string;
    }>;

    /*
     * The Supabase /v1/projects endpoint exposes no user name or email, and the
     * PAT is opaque, so we only surface the real organization id rather than
     * fabricating a placeholder identity.
     */
    const user = projects.length > 0 ? { id: projects[0].organization_id } : null;

    return json(
      {
        user,
        projects: projects.map((project) => ({
          id: project.id,
          name: project.name,
          region: project.region,
          status: project.status,
          organization_id: project.organization_id,
          created_at: project.created_at,
        })),
      },
      { headers: webApiLocaleHeaders(request) },
    );
  } catch (error) {
    console.error('Error fetching Supabase user:', error);
    return webApiErrorResponse(request, 'SUPABASE_USER_FAILED', 503);
  }
}

export const loader = withSecurity(supabaseUserLoader, {
  rateLimit: true,
  allowedMethods: ['GET'],
});

async function supabaseUserAction({ request }: { request: Request }) {
  try {
    const formData = await request.formData();
    const action = formData.get('action');

    // Get API keys from cookies (server-side only)
    const cookieHeader = request.headers.get('Cookie');
    const apiKeys = getApiKeysFromCookie(cookieHeader);

    // Try to get Supabase token from various sources
    const supabaseToken = apiKeys.VITE_SUPABASE_ACCESS_TOKEN;

    if (!supabaseToken) {
      return webApiErrorResponse(request, 'SUPABASE_TOKEN_MISSING', 401);
    }

    if (action === 'get_projects') {
      // Fetch user projects
      const response = await fetch('https://api.supabase.com/v1/projects', {
        signal: AbortSignal.timeout(15000),
        headers: {
          Authorization: `Bearer ${supabaseToken}`,
          'User-Agent': 'e-code-app',
        },
      });

      if (!response.ok) {
        console.error('Supabase projects request failed:', { status: response.status });
        throw new Error();
      }

      const projects = (await response.json()) as Array<{
        id: string;
        name: string;
        region: string;
        status: string;
        organization_id: string;
        created_at: string;
      }>;

      /*
       * Only surface the real organization id; the endpoint exposes no user
       * name or email, so we avoid fabricating a placeholder identity.
       */
      const user = projects.length > 0 ? { id: projects[0].organization_id } : null;

      return json({
        user,
        stats: {
          projects: projects.map((project) => ({
            id: project.id,
            name: project.name,
            region: project.region,
            status: project.status,
            organization_id: project.organization_id,
            created_at: project.created_at,
          })),
          totalProjects: projects.length,
        },
      });
    }

    if (action === 'get_api_keys') {
      const projectId = formData.get('projectId');

      if (!projectId) {
        return webApiErrorResponse(request, 'SUPABASE_PROJECT_REQUIRED', 400);
      }

      /*
       * Validate the project ref before interpolating it into the upstream URL
       * (Supabase refs are alphanumeric) to prevent path injection.
       */
      if (typeof projectId !== 'string' || !/^[a-zA-Z0-9]{1,40}$/.test(projectId)) {
        return webApiErrorResponse(request, 'SUPABASE_PROJECT_INVALID', 400);
      }

      // Fetch project API keys
      const response = await fetch(`https://api.supabase.com/v1/projects/${encodeURIComponent(projectId)}/api-keys`, {
        signal: AbortSignal.timeout(15000),
        headers: {
          Authorization: `Bearer ${supabaseToken}`,
          'User-Agent': 'e-code-app',
        },
      });

      if (!response.ok) {
        console.error('Supabase API keys request failed:', { status: response.status });
        throw new Error();
      }

      const apiKeys = (await response.json()) as Array<{
        name: string;
        api_key: string;
      }>;

      return json({
        apiKeys: apiKeys.map((key) => ({
          name: key.name,
          api_key: key.api_key,
        })),
      });
    }

    return webApiErrorResponse(request, 'SUPABASE_ACTION_INVALID', 400);
  } catch (error) {
    console.error('Error in Supabase user action:', error);
    return webApiErrorResponse(request, 'SUPABASE_REQUEST_FAILED', 503);
  }
}

export const action = withSecurity(supabaseUserAction, {
  rateLimit: true,
  allowedMethods: ['POST'],
});
