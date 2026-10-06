import { cookieSecure } from '~/lib/enterprise-api.server';
import { themeCookieDomain } from '~/lib/stores/theme-cookie';

/**
 * LE JETON DU RELAIS D'IDÉE, D'UN DOMAINE À L'AUTRE
 * (BUG-QA0928-IDEE-PERDUE-INSCRIPTION, seconde moitié).
 *
 * L'idée tapée sur l'accueil de `e-code.ai` est gardée par l'API (une heure,
 * rendue une seule fois). Ce cookie ne porte que son IDENTIFIANT opaque, sur le
 * domaine commun (`.e-code.ai`), pour qu'il suive le visiteur jusqu'à
 * `app.e-code.ai` à travers le 301 de `/login` et l'inscription — comme le
 * cookie de thème, et par la même règle de domaine.
 *
 * `HttpOnly` : aucun script de page n'a à le lire. Jamais l'idée elle-même,
 * jamais dans une adresse : une adresse finit dans les journaux de tous les
 * intermédiaires.
 */
export const COOKIE_RELAIS_IDEE = 'ecode_relais_idee';

const DUREE_S = 60 * 60;

function attributs(request: Request) {
  const hote = (request.headers.get('host') ?? new URL(request.url).host).split(':')[0].toLowerCase();
  const domaine = themeCookieDomain(hote);

  return `Path=/; HttpOnly; SameSite=Lax${domaine ? `; Domain=${domaine}` : ''}${cookieSecure()}`;
}

/** L'en-tête `Set-Cookie` qui pose le jeton. */
export function poserLeJetonDuRelais(request: Request, jeton: string): string {
  return `${COOKIE_RELAIS_IDEE}=${encodeURIComponent(jeton)}; Max-Age=${DUREE_S}; ${attributs(request)}`;
}

/** L'en-tête `Set-Cookie` qui l'efface — même domaine, sinon le navigateur garde l'ancien. */
export function effacerLeJetonDuRelais(request: Request): string {
  return `${COOKIE_RELAIS_IDEE}=; Max-Age=0; ${attributs(request)}`;
}

export function lireLeJetonDuRelais(request: Request): string | null {
  for (const paire of (request.headers.get('cookie') ?? '').split(';')) {
    const egal = paire.indexOf('=');

    if (egal > 0 && paire.slice(0, egal).trim() === COOKIE_RELAIS_IDEE) {
      const valeur = decodeURIComponent(paire.slice(egal + 1).trim());

      return /^[A-Za-z0-9_-]{32}$/.test(valeur) ? valeur : null;
    }
  }

  return null;
}
