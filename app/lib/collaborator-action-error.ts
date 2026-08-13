import { apiErrorMessage, json } from '~/lib/enterprise-api.server';

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
export async function handleCollaboratorActionError(error: unknown) {
  if (error instanceof Response && error.status >= 300 && error.status < 400) {
    throw error;
  }

  if (error instanceof Response) {
    const status = error.status;
    const msg = await apiErrorMessage(error, 'Unable to add collaborator. Check the email and try again.');

    return json({ error: msg }, { status });
  }

  throw error;
}
