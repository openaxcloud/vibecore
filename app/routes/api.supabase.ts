import { type ActionFunction } from 'react-router';
import { preferredConnectorToken } from '~/lib/connectors/connector-token.server';
import {
  getWebApiRoutesCopy,
  interpolateWebApiCopy,
  webApiErrorResponse,
  webApiLocaleHeaders,
} from '~/lib/i18n/catalogs/web-api-routes';
import { resolveRequestLocale } from '~/lib/i18n/request-locale';
import { json } from '~/lib/json-response';
import type { SupabaseProject } from '~/types/supabase';

export const action: ActionFunction = async ({ request }) => {
  if (request.method !== 'POST') {
    return webApiErrorResponse(request, 'SUPABASE_METHOD_NOT_ALLOWED', 405);
  }

  try {
    const { token: fallbackToken } = (await request.json()) as any;

    /*
     * Prefer the cross-device UserConnection token (server-decrypted for the
     * owner) over the bolt localStorage token; falls back cleanly.
     */
    const token = await preferredConnectorToken(request, 'supabase', fallbackToken);

    if (!token || typeof token !== 'string') {
      return webApiErrorResponse(request, 'SUPABASE_ACCESS_TOKEN_REQUIRED', 400);
    }

    const projectsResponse = await fetch('https://api.supabase.com/v1/projects', {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },

      // Bound the outbound call so a hung Supabase API can't pin this request.
      signal: AbortSignal.timeout(30000),
    });

    if (!projectsResponse.ok) {
      const errorText = await projectsResponse.text();
      console.error('Projects fetch failed:', errorText);

      return webApiErrorResponse(request, 'SUPABASE_PROJECTS_FAILED', 401);
    }

    const projects = (await projectsResponse.json()) as SupabaseProject[];

    const uniqueProjectsMap = new Map<string, SupabaseProject>();

    for (const project of projects) {
      if (!uniqueProjectsMap.has(project.id)) {
        uniqueProjectsMap.set(project.id, project);
      }
    }

    const uniqueProjects = Array.from(uniqueProjectsMap.values());

    uniqueProjects.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    /*
     * Resolve the real organization the access token belongs to so the UI can
     * show a truthful identity instead of the old hardcoded "Connected / Admin".
     * The Supabase PAT is opaque (no owner email is recoverable from it), so the
     * accessible organization is the closest real identity we can surface.
     */
    let organizations: Array<{ id: string; name: string; plan?: string | { name?: string }; created_at?: string }> = [];

    try {
      const orgsResponse = await fetch('https://api.supabase.com/v1/organizations', {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(30000),
      });

      if (orgsResponse.ok) {
        organizations = (await orgsResponse.json()) as typeof organizations;
      } else {
        console.error('Supabase organizations fetch failed:', await orgsResponse.text());
      }
    } catch (orgError) {
      console.error('Supabase organizations fetch error:', orgError);
    }

    const primaryOrgId = uniqueProjects[0]?.organization_id;
    const primaryOrg = organizations.find((org) => org.id === primaryOrgId) ?? organizations[0];
    const planName = typeof primaryOrg?.plan === 'string' ? primaryOrg.plan : primaryOrg?.plan?.name;

    /*
     * uniqueProjects is sorted newest-first, so the last entry is the oldest
     * project — a real "member since" proxy when the org has no created_at.
     */
    const oldestProjectCreatedAt = uniqueProjects[uniqueProjects.length - 1]?.created_at;
    const copy = getWebApiRoutesCopy(resolveRequestLocale(request).language);

    return json(
      {
        user: {
          id: primaryOrg?.id ?? primaryOrgId ?? 'supabase-account',
          email: primaryOrg?.name ?? copy.supabaseAccount,
          role: planName
            ? interpolateWebApiCopy(copy.supabasePlan, { plan: planName })
            : copy.supabaseConnectedAccessToken,
          created_at: primaryOrg?.created_at ?? oldestProjectCreatedAt ?? '',
          last_sign_in_at: '',
        },
        stats: {
          projects: uniqueProjects,
          totalProjects: uniqueProjects.length,
        },
      },
      { headers: webApiLocaleHeaders(request) },
    );
  } catch (error) {
    console.error('Supabase API error:', error);
    return webApiErrorResponse(request, 'SUPABASE_AUTH_FAILED', 401);
  }
};
