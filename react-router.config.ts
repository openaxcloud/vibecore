import type { Config } from '@react-router/dev/config';

export default {
  /*
   * Server-side rendering stays on — the app SSRs the marketing pages and the
   * IDE boot shell (entry.server.tsx renders <ServerRouter />). This was the
   * implicit default under the Remix Vite plugin.
   */
  ssr: true,
} satisfies Config;
