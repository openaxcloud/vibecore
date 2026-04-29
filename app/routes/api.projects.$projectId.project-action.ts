import {
  apiRequest,
  formObject,
  json,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';

export async function loader({ request, params }: EnterpriseLoaderArgs) {
  const projectId = params.projectId;

  if (!projectId) {
    throw json({ error: 'Project not found' }, { status: 404 });
  }

  const url = new URL(request.url);

  if (url.searchParams.get('intent') !== 'export') {
    throw json({ error: 'Unsupported project action' }, { status: 404 });
  }

  const exported = await apiRequest<{ archive?: { base64?: string; storageKey?: string; byteLength?: number } }>(
    request,
    `/projects/${projectId}/export/zip`,
  );
  const base64 = exported.archive?.base64;

  if (!base64) {
    throw json({ error: 'Project export did not return an archive' }, { status: 502 });
  }

  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));

  return new Response(bytes, {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="${projectId}.zip"`,
      'content-length': String(exported.archive?.byteLength ?? bytes.byteLength),
    },
  });
}

export async function action({ request, params }: EnterpriseActionArgs) {
  const projectId = params.projectId;

  if (!projectId) {
    throw json({ error: 'Project not found' }, { status: 404 });
  }

  const body = formObject(await request.formData()) as Record<string, string>;
  const intent = body.intent;

  if (intent === 'duplicate' || intent === 'fork') {
    const suffix = intent === 'fork' ? 'Fork' : 'Copy';
    const duplicated = await apiRequest(request, `/projects/${projectId}/duplicate`, {
      method: 'POST',
      body: JSON.stringify({ name: body.name || `${body.projectName || 'Project'} ${suffix}` }),
    });

    return json({ ok: true, project: duplicated });
  }

  if (intent === 'delete') {
    await apiRequest(request, `/projects/${projectId}`, { method: 'DELETE' });

    return json({ ok: true });
  }

  if (intent === 'rename') {
    await apiRequest(request, `/projects/${projectId}/settings`, {
      method: 'PATCH',
      body: JSON.stringify({ name: body.name }),
    });

    return json({ ok: true });
  }

  throw json({ error: 'Unsupported project action' }, { status: 404 });
}
