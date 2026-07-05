import { apiRequest, redirect, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';

/*
 * Serves a project's REAL captured preview thumbnail. The API returns a short-lived
 * signed object-storage URL for the latest screenshot; we 302 the <img> straight to
 * it. If no thumbnail has been captured yet (or it's unavailable) we return 404 so
 * the card shows its neutral placeholder instead of a fake mock.
 */
export async function loader({ request, params }: EnterpriseLoaderArgs) {
  if (!params.projectId) {
    return new Response(null, { status: 404 });
  }

  try {
    const result = await apiRequest<{ url?: string }>(request, `/projects/${params.projectId}/thumbnail`);

    if (!result?.url) {
      return new Response(null, { status: 404 });
    }

    return redirect(result.url);
  } catch {
    return new Response(null, { status: 404 });
  }
}
