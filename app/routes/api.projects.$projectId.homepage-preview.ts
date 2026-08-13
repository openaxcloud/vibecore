import { apiRequest, json, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';

export async function loader({ request, params }: EnterpriseLoaderArgs) {
  if (!params.projectId) {
    return json({ ok: false, error: 'Project not found' }, { status: 404 });
  }

  const svg = await apiRequest<string>(request, `/projects/${params.projectId}/homepage-preview.svg`);

  return new Response(svg, {
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': 'private, max-age=60',
    },
  });
}
