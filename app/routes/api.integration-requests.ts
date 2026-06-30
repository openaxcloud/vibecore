import { apiRequest, type EnterpriseActionArgs, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';

/*
 * Browser-accessible proxy for the @settings → Connections "Request an
 * integration" card. The client component LISTs the user's (and their org's)
 * integration feature requests and SUBMITs new ones, but those live on the API
 * service (`/api/integration-requests`). This resource route forwards the
 * session/auth so the same data + submit action are reachable from `fetch()`.
 */
type IntegrationFeatureRequest = {
  id: string;
  integrationName: string;
  useCaseDescription: string;
  status: string;
  organizationId: string | null;
  createdAt: string;
  mine: boolean;
};

export async function loader({ request }: EnterpriseLoaderArgs) {
  const url = new URL(request.url);
  const organizationId = url.searchParams.get('organizationId')?.trim();
  const query = organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : '';

  const result = await apiRequest<{ requests: IntegrationFeatureRequest[] }>(
    request,
    `/api/integration-requests${query}`,
  ).catch(() => ({ requests: [] as IntegrationFeatureRequest[] }));

  return Response.json({ requests: result.requests });
}

export async function action({ request }: EnterpriseActionArgs) {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  const form = await request.formData();
  const integrationName = String(form.get('integrationName') ?? '').trim();
  const useCaseDescription = String(form.get('useCaseDescription') ?? '').trim();
  const organizationId = String(form.get('organizationId') ?? '').trim();

  if (!integrationName || !useCaseDescription) {
    return Response.json({ error: 'An integration name and a use-case description are required.' }, { status: 400 });
  }

  try {
    const result = await apiRequest<{ request: IntegrationFeatureRequest }>(request, '/api/integration-requests', {
      method: 'POST',
      body: JSON.stringify({
        integrationName,
        useCaseDescription,
        ...(organizationId ? { organizationId } : {}),
      }),
    });

    return Response.json({ ok: true, request: result.request });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unable to submit your integration request.' },
      { status: 502 },
    );
  }
}
