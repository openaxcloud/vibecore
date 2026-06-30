import { useEffect } from 'react';
import { hydrateNetlifyFromUserConnection } from '~/lib/stores/netlify';
import { hydrateSupabaseFromUserConnection } from '~/lib/stores/supabase';
import { hydrateVercelFromUserConnection } from '~/lib/stores/vercel';

/*
 * On IDE load, recover the user's Vercel / Netlify / Supabase connections from
 * the encrypted server-side UserConnection so a signed-in user sees "connected"
 * and can deploy / run SQL from any device without re-pasting their token. Each
 * hydrate is best-effort and skips when this device already has a local
 * connection, so it never disturbs an active session. Runs once per mount.
 */
export function useHydrateConnectors() {
  useEffect(() => {
    void hydrateNetlifyFromUserConnection();
    void hydrateVercelFromUserConnection();
    void hydrateSupabaseFromUserConnection();
  }, []);
}
