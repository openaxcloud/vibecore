import { type LoaderFunctionArgs } from 'react-router';
import { resolveConnectorToken, type DeployConnectorProvider } from '~/lib/connectors/connector-token.server';
import { json } from '~/lib/json-response';
import { withSecurity } from '~/lib/security';

/*
 * Client hydration source for cross-device connectors. The browser stores
 * (bolt nanostores) call this on IDE load to recover the user's Vercel / Netlify
 * / Supabase token from the encrypted server-side UserConnection — so a fresh
 * device shows "connected" and the deploy/status polls use the real token without
 * the user re-pasting it.
 *
 * Owner-scoping is enforced by the API service: resolveConnectorToken forwards the
 * session cookie to GET /api/integrations/:provider/token, which only ever returns
 * the *caller's own* connection (401/404 → null here). An unauthenticated browser
 * therefore gets `{ token: null }`. Git providers are not exposed.
 */
const ALLOWED = new Set<DeployConnectorProvider>(['vercel', 'netlify', 'supabase']);

async function connectorTokenLoader({ request, params }: LoaderFunctionArgs) {
  const provider = params.provider as DeployConnectorProvider;

  if (!ALLOWED.has(provider)) {
    return json({ token: null, error: 'Unsupported connector provider' }, { status: 400 });
  }

  const token = await resolveConnectorToken(request, provider);

  return json({ provider, token });
}

export const loader = withSecurity(connectorTokenLoader, {
  rateLimit: true,
  allowedMethods: ['GET'],
});
