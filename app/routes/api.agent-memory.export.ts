import { apiRequest, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';

/**
 * Build a raw JSON download Response for the agent-memory export.
 *
 * This must be a real `Response` (not the framework's `json`/`data` helper):
 * under single-fetch, `data()` returns a DataWithResponseInit sentinel that the
 * framework serializes as turbo-stream, so the saved file would NOT be parseable
 * JSON. Mirror api.auth.export.ts and stream a genuine JSON body instead.
 */
export function buildAgentMemoryExportResponse(payload: unknown, now: Date = new Date()): Response {
  const body = JSON.stringify(payload, null, 2);

  return new Response(body, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="agent-memory-${now.toISOString()}.json"`,
      'content-length': String(new TextEncoder().encode(body).byteLength),
    },
  });
}

export async function loader({ request }: EnterpriseLoaderArgs) {
  const url = new URL(request.url);
  const query = url.searchParams.toString();
  const payload = await apiRequest(request, `/agent-memory/export${query ? `?${query}` : ''}`);

  return buildAgentMemoryExportResponse(payload);
}
