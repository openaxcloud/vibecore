import { apiErrorMessage, json } from '~/lib/enterprise-api.server';
import { getProjectCollaboratorsCopy } from '~/lib/i18n/catalogs/project-collaborators';

/*
 * Lives in ~/lib (not the route module) so the collaborators route can import a
 * `*.server` module without exporting a non-route symbol — which would otherwise
 * drag the server module into the client bundle. The route uses this only inside
 * its action, so React Router strips it (and this module) from the client build.
 */

/**
 * Normalise an error thrown by a collaborator mutation. 3xx re-auth redirects are
 * re-thrown so the framework performs the login/MFA redirect; other API Responses
 * become a rendered inline error; anything else propagates.
 */
export async function handleCollaboratorActionError(error: unknown, language?: string | null) {
  if (error instanceof Response && error.status >= 300 && error.status < 400) {
    throw error;
  }

  if (error instanceof Response) {
    const status = error.status;
    const fallback = getProjectCollaboratorsCopy(language)['projectCollaborators.error.add'];
    const msg = language?.toLowerCase().startsWith('fr') ? fallback : await apiErrorMessage(error, fallback);

    return json({ error: msg }, { status });
  }

  throw error;
}
