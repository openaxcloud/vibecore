import { safeReturnTo } from '~/lib/enterprise-api.server';

/*
 * The homepage builder form sends the visitor's app idea as ?prompt=. After registration we forward
 * it to the new-project composer so the first thing they see is their idea ready to build.
 */
export function postRegisterDestination(request: Request): string {
  const params = new URL(request.url).searchParams;
  const prompt = params.get('prompt')?.trim();

  if (prompt) {
    return `/projects/new?prompt=${encodeURIComponent(prompt)}`;
  }

  /*
   * BUG-QA0928-IDEE-PERDUE-INSCRIPTION — la destination d'où venait l'inconnu
   * (`/projects/new`, où l'attend son idée relayée par l'accueil). Validée comme
   * à la connexion : un chemin interne, jamais une URL externe.
   */
  return safeReturnTo(params.get('returnTo')) ?? '/dashboard';
}
