/*
 * D5 dedicated E2E harness — environment resolution.
 *
 * These journeys drive a DEPLOYED environment (they exercise real workspaces,
 * the IDE, preview and publish — infra the ephemeral local CI stack in
 * tests/e2e/ does not have). Everything is env-driven so the SAME spec runs
 * against staging or prod; NOTHING here reads a personal browser profile or a
 * hardcoded personal credential — the test user's credentials come from env
 * (E2E_USER_EMAIL / E2E_USER_PASSWORD), to be provided as CI/staging secrets.
 */

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;

  if (!value) {
    throw new Error(
      `Missing required env ${name}. This is a dedicated-test-user secret; set it in the environment ` +
        `(CI secret / staging vault). The D5 harness never uses personal cookies or hardcoded personal creds.`,
    );
  }

  return value;
}

export const env = {
  /** The web app under test (app host), e.g. https://app.e-code.ai. */
  baseURL: process.env.E2E_BASE_URL ?? 'https://app.e-code.ai',
  /** The API host, e.g. https://api.e-code.ai. */
  apiURL: process.env.E2E_API_URL ?? 'https://api.e-code.ai',
  /** Dedicated (non-personal) test user. */
  get userEmail() {
    return required('E2E_USER_EMAIL');
  },
  get userPassword() {
    return required('E2E_USER_PASSWORD');
  },
  /** A gallery listing slug the Remix journey drives. Curated fixture. */
  gallerySlug: process.env.E2E_GALLERY_SLUG ?? 'realtime-chat-starter',
  /** Short git SHA of the code under test (for evidence provenance). */
  commit: process.env.E2E_COMMIT ?? process.env.GIT_COMMIT ?? 'unknown',
} as const;
