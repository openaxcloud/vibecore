import { apiRequest, json, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';

export async function loader({ request }: EnterpriseLoaderArgs) {
  const exported = await apiRequest(request, '/auth/export');
  const body = JSON.stringify(exported, null, 2);

  return new Response(body, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': 'attachment; filename="vibecore-account-export.json"',
      'content-length': String(new TextEncoder().encode(body).byteLength),
    },
  });
}

export async function action() {
  throw json({ error: 'Unsupported method' }, { status: 405 });
}
