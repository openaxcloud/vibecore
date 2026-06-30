import { redirect } from 'react-router';

import {
  EcodeSurfacePage,
  getEcodeStandaloneSurfacePage,
  makeEcodeSurfaceMeta,
} from '~/components/marketing/EcodeSurfacePages';
import { apiRequest, readSessionToken, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';
import { projectIdePath } from '~/utils/project-url';

const page = getEcodeStandaloneSurfacePage('ai-agent/studio')!;

export const meta = makeEcodeSurfaceMeta(page);

type Organization = { id: string; slug?: string };
type ApiProject = { id: string; name?: string; slug?: string; updatedAt?: string };

/*
 * The Agent Studio is a per-project supervisor surface that lives inside the
 * IDE (panel `studio`), not a standalone page — the agent signals it
 * aggregates (patch proposals / self-repair / branches / memory) are all
 * scoped to a single project. So for a signed-in user we send them straight
 * into their most-recently-updated project's Studio panel. Anonymous visitors
 * (no session) keep seeing the marketing page so the public surface stays
 * reachable. Every API call is best-effort: any failure falls through to the
 * marketing render rather than erroring the route.
 */
export async function loader({ request }: EnterpriseLoaderArgs) {
  if (!readSessionToken(request)) {
    return null;
  }

  try {
    const { organizations } = await apiRequest<{ organizations: Organization[] }>(request, '/orgs');
    const organization = organizations?.[0];

    if (!organization) {
      return null;
    }

    const { projects } = await apiRequest<{ projects: ApiProject[] }>(request, `/orgs/${organization.id}/projects`);

    const mostRecent = [...(projects ?? [])].sort((a, b) =>
      String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')),
    )[0];

    if (!mostRecent) {
      return null;
    }

    const idePath = projectIdePath(
      {
        id: mostRecent.id,
        slug: mostRecent.slug,
        organizationSlug: organization.slug,
      },
      { panel: 'studio' },
    );

    return redirect(idePath);
  } catch {
    // Best-effort: any auth/network failure just shows the marketing surface.
    return null;
  }
}

export default function AiAgentStudioRoute() {
  return <EcodeSurfacePage page={page} />;
}
