import { apiRequest, readSessionToken } from '~/lib/enterprise-api.server';

/*
 * BUG-QA1001-CONNECTE-REVOIT-LA-CONNEXION — deuxième visite d'un client déjà
 * connecté : sur e-code.ai, « Se connecter » le mène (301) à app.e-code.ai/login,
 * où sa session est pourtant valide… et la page lui redemande son mot de passe.
 * Même chose sur /register, où il peut créer un second compte par erreur.
 *
 * Seule une visite DÉLIBÉRÉE est renvoyée vers l'espace de travail : l'adresse
 * ne porte aucun paramètre en dehors de `lang`. Toute autre forme garde le
 * formulaire, et c'est voulu :
 *   - `returnTo` : c'est la trace d'un 401 (session expirée). Renvoyer vers la
 *     destination pourrait boucler si cette page renvoyait elle-même ici ;
 *   - `oauth` / `error` / `detail` : un échec de connexion d'un compte social,
 *     parfois pour un client DÉJÀ connecté — le message doit rester lisible ;
 *   - le reste (offre choisie, etc.) : on ne devine pas l'intention.
 *
 * La session est vérifiée auprès de l'API : un cookie présent mais révoqué ou
 * expiré n'est pas une session, et ce visiteur doit voir le formulaire.
 */
const PARAMETRES_SANS_INTENTION = new Set(['lang']);

export async function espaceDuClientDejaConnecte(request: Request): Promise<string | null> {
  const adresse = new URL(request.url);

  for (const nom of adresse.searchParams.keys()) {
    if (!PARAMETRES_SANS_INTENTION.has(nom)) {
      return null;
    }
  }

  if (!readSessionToken(request)) {
    return null;
  }

  try {
    const reponse = await apiRequest<{ user?: { id?: string } }>(request, '/auth/me', { redirectOn401: false });

    return reponse.user?.id ? '/dashboard' : null;
  } catch {
    // Session refusée (401), MFA en attente, API injoignable : le formulaire reste la réponse sûre.
    return null;
  }
}
