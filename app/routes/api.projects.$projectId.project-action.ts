import {
  apiErrorMessage,
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

  let exported: { archive?: { base64?: string; storageKey?: string; byteLength?: number } };

  try {
    exported = await apiRequest<{ archive?: { base64?: string; storageKey?: string; byteLength?: number } }>(
      request,
      `/projects/${projectId}/export/zip`,
    );
  } catch (error) {
    const message = await apiErrorMessage(error, 'Project export failed');
    const status = error instanceof Response && error.status !== 500 ? error.status : 502;

    throw json(
      {
        ok: false,
        error: message,
        code: status === 401 || status === 403 ? 'PROJECT_EXPORT_AUTH_REQUIRED' : 'PROJECT_EXPORT_UNAVAILABLE',
      },
      { status },
    );
  }

  const base64 = exported.archive?.base64;

  if (!base64) {
    throw json({ error: 'Project export did not return an archive' }, { status: 502 });
  }

  let bytes: Uint8Array;

  try {
    bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  } catch {
    throw json({ error: 'Project export returned a corrupt archive' }, { status: 502 });
  }

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

  /*
   * Mutation failures are RETURNED (not thrown) so useFetcher callers get
   * `{ ok: false, error }` in fetcher.data and can toast it, instead of
   * tripping the route ErrorBoundary.
   */
  try {
    if (intent === 'duplicate' || intent === 'fork') {
      const suffix = intent === 'fork' ? 'Fork' : 'Copy';

      const duplicated = await apiRequest(request, `/projects/${projectId}/duplicate`, {
        method: 'POST',
        body: JSON.stringify({ name: body.name || `${body.projectName || 'Project'} ${suffix}` }),
      });

      return json({ ok: true, project: duplicated });
    }

    /*
     * 'delete' predates the Archive/Delete split and is kept as an alias of the
     * soft-delete for existing callers; 'archive' is the card-menu intent.
     */
    if (intent === 'delete' || intent === 'archive') {
      await apiRequest(request, `/projects/${projectId}`, { method: 'DELETE' });

      return json({ ok: true });
    }

    if (intent === 'unarchive') {
      await apiRequest(request, `/projects/${projectId}/restore`, { method: 'POST' });

      return json({ ok: true });
    }

    if (intent === 'delete-permanent') {
      /*
       * F13: forward the typed name confirmation so the API can re-verify it
       * server-side (defense-in-depth) before the irreversible hard delete.
       */
      await apiRequest(request, `/projects/${projectId}/permanent`, {
        method: 'DELETE',
        ...(body.confirmName ? { body: JSON.stringify({ confirmName: body.confirmName }) } : {}),
      });

      return json({ ok: true });
    }

    if (intent === 'rename') {
      await apiRequest(request, `/projects/${projectId}/settings`, {
        method: 'PATCH',
        body: JSON.stringify({ name: body.name }),
      });

      return json({ ok: true });
    }
  } catch (error) {
    const message = await apiErrorMessage(error, 'Project action failed');
    const status = error instanceof Response && error.status !== 500 ? error.status : 502;

    return json({ ok: false, error: message }, { status });
  }

  throw json({ error: 'Unsupported project action' }, { status: 404 });
}
