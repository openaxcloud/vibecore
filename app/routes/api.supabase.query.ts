import { type ActionFunctionArgs } from 'react-router';
import { resolveConnectorToken } from '~/lib/connectors/connector-token.server';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('api.supabase.query');

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const authHeader = request.headers.get('Authorization');

  /*
   * Cross-device: prefer the server-decrypted UserConnection token over the
   * Authorization header (which carries the localStorage token). Falls back to
   * the header when the user has no active server connection.
   */
  const serverToken = await resolveConnectorToken(request, 'supabase');
  const upstreamAuth = serverToken ? `Bearer ${serverToken}` : authHeader;

  if (!upstreamAuth) {
    return new Response('No authorization token provided', { status: 401 });
  }

  try {
    const { projectId, query } = (await request.json()) as any;

    if (!projectId || typeof projectId !== 'string' || !query || typeof query !== 'string') {
      return new Response(JSON.stringify({ error: { message: 'projectId and query are required' } }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!/^[a-zA-Z0-9-]+$/.test(projectId)) {
      return new Response(JSON.stringify({ error: { message: 'Invalid projectId' } }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    logger.debug('Executing query:', { projectId, query });

    const response = await fetch(`https://api.supabase.com/v1/projects/${projectId}/database/query`, {
      method: 'POST',
      headers: {
        Authorization: upstreamAuth,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const errorText = await response.text();

      let errorData;

      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { message: errorText };
      }

      logger.error(
        'Supabase API error:',
        JSON.stringify({
          status: response.status,
          statusText: response.statusText,
          error: errorData,
        }),
      );

      return new Response(
        JSON.stringify({
          error: {
            status: response.status,
            statusText: response.statusText,
            message: errorData.message || errorData.error || errorText,
            details: errorData,
          },
        }),
        {
          status: response.status,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );
    }

    const result = await response.json();

    return new Response(JSON.stringify(result), {
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    logger.error('Query execution error:', error);
    return new Response(
      JSON.stringify({
        /*
         * Never leak the server stack trace to the client — it exposes internal
         * file paths and module structure. The full error is logged above.
         */
        error: {
          message: error instanceof Error ? error.message : 'Query execution failed',
        },
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      },
    );
  }
}
