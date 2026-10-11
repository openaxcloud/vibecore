import { createServer, type Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loader as departOAuth } from './auth.oauth.$provider';
import { loader as retourOAuth } from './auth.oauth.$provider.callback';

/*
 * BUG-QA0930-OAUTH-OUBLIE-LA-DESTINATION — s'inscrire ou se connecter avec
 * Google / GitHub renvoyait TOUJOURS au tableau de bord. Relevé le 2026-09-30 en
 * production : les boutons de `/register?returnTo=…` et `/login?returnTo=…`
 * pointaient vers `/auth/oauth/<fournisseur>` sans destination, et le retour
 * faisait `redirect('/dashboard')` sans condition. Même classe que
 * BUG-QA0928-IDEE-PERDUE-INSCRIPTION, par l'autre entrée de l'inscription.
 *
 * Les VRAIES routes, contre un vrai serveur HTTP qui joue l'API (aucun module
 * remplacé) : le départ doit garder la destination, le retour doit y mener.
 */

let api: Server;
let precedent: string | undefined;

beforeEach(async () => {
  api = createServer((requete, reponse) => {
    const chemin = new URL(requete.url ?? '/', 'http://api.local').pathname;

    reponse.setHeader('content-type', 'application/json');

    if (chemin.endsWith('/start')) {
      reponse.end(
        JSON.stringify({
          ready: true,
          authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?state=etat-signe',
        }),
      );

      return;
    }

    if (chemin.endsWith('/callback')) {
      reponse.end(JSON.stringify({ token: 'jeton-de-session' }));

      return;
    }

    reponse.writeHead(404).end('{}');
  });

  await new Promise<void>((resolve) => api.listen(0, '127.0.0.1', resolve));
  precedent = process.env.SAAS_API_URL;
  process.env.SAAS_API_URL = `http://127.0.0.1:${(api.address() as { port: number }).port}`;
});

afterEach(async () => {
  if (precedent === undefined) {
    delete process.env.SAAS_API_URL;
  } else {
    process.env.SAAS_API_URL = precedent;
  }

  await new Promise<void>((resolve) => api.close(() => resolve()));
});

/** Un loader de route rend (ou lève) une redirection : on la récupère dans les deux cas. */
async function redirection(appel: () => Promise<unknown>): Promise<Response> {
  try {
    const resultat = await appel();

    if (resultat instanceof Response) {
      return resultat;
    }
  } catch (leve) {
    if (leve instanceof Response) {
      return leve;
    }

    throw leve;
  }

  throw new Error('aucune redirection');
}

const cookiesPoses = (reponse: Response) =>
  (reponse.headers.getSetCookie?.() ?? [reponse.headers.get('set-cookie') ?? '']).join('\n');

async function depart(requete: string) {
  const reponse = await redirection(() =>
    departOAuth({ request: new Request(requete), params: { provider: 'google' }, context: {} } as never),
  );

  return { reponse, cookies: cookiesPoses(reponse) };
}

async function retour(cookie: string) {
  return redirection(() =>
    retourOAuth({
      request: new Request('https://app.e-code.ai/auth/oauth/google/callback?code=c&state=etat-signe', {
        headers: { cookie },
      }),
      params: { provider: 'google' },
      context: {},
    } as never),
  );
}

describe('OAuth garde la destination du visiteur', () => {
  it('le DÉPART garde une destination sûre pour le retour', async () => {
    const { reponse, cookies } = await depart('https://app.e-code.ai/auth/oauth/google?returnTo=%2Fprojects%2Fnew');

    expect(reponse.headers.get('location')).toMatch(/^https:\/\/accounts\.google\.com\//);
    expect(cookies).toMatch(/vc_oauth_return=%2Fprojects%2Fnew;/);
  });

  it('le DÉPART refuse une destination hors du site', async () => {
    const { cookies } = await depart('https://app.e-code.ai/auth/oauth/google?returnTo=%2F%2Fevil.example%2F');

    expect(cookies).not.toMatch(/vc_oauth_return=[^;]/);
  });

  it('le RETOUR mène à la destination gardée, et l’efface', async () => {
    const reponse = await retour('vc_oauth_state=google%3Aetat-signe; vc_oauth_return=%2Fprojects%2Fnew');

    expect(reponse.headers.get('location')).toBe('/projects/new');
    expect(cookiesPoses(reponse)).toMatch(/vc_oauth_return=;[^\n]*Max-Age=0/);
  });

  it('sans destination gardée, le retour mène au tableau de bord, comme avant', async () => {
    const reponse = await retour('vc_oauth_state=google%3Aetat-signe');

    expect(reponse.headers.get('location')).toBe('/dashboard');
  });

  it('une destination piégée glissée dans le cookie n’est jamais suivie', async () => {
    const reponse = await retour('vc_oauth_state=google%3Aetat-signe; vc_oauth_return=%2F%2Fevil.example%2F');

    expect(reponse.headers.get('location')).toBe('/dashboard');
  });
});
