import { data as json, type ActionFunctionArgs } from 'react-router';
import { preferredConnectorToken } from '~/lib/connectors/connector-token.server';

export async function action({ request }: ActionFunctionArgs) {
  try {
    // Add proper type assertion for the request body
    const body = (await request.json()) as { projectId?: string; token?: string };
    const { projectId, token: fallbackToken } = body;

    // Cross-device: prefer the server UserConnection token over localStorage.
    const token = await preferredConnectorToken(request, 'supabase', fallbackToken);

    if (!projectId || !token) {
      return json({ error: 'Project ID and token are required' }, { status: 400 });
    }

    /*
     * Validate the project ref before interpolating it into the upstream URL. A
     * value containing '/', '.', or query chars could otherwise redirect the
     * call to a different Supabase API path. Supabase project refs are short
     * alphanumeric strings.
     */
    if (!/^[a-zA-Z0-9]{1,40}$/.test(projectId)) {
      return json({ error: 'Invalid project ID' }, { status: 400 });
    }

    const response = await fetch(`https://api.supabase.com/v1/projects/${encodeURIComponent(projectId)}/api-keys`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },

      // Bound the upstream call so a hung Supabase API can't pin the request handler.
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      return json({ error: `Failed to fetch API keys: ${response.statusText}` }, { status: response.status });
    }

    const apiKeys = await response.json();

    return json({ apiKeys });
  } catch (error) {
    console.error('Error fetching project API keys:', error);
    return json({ error: error instanceof Error ? error.message : 'Unknown error occurred' }, { status: 500 });
  }
}
