import { createServer, type Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loader as connexion } from './login';
import { loader as inscription } from './signup';

/*
 * BUG-QA1001-CONNECTE-REVOIT-LA-CONNEXION — mesuré le 2026-10-01 en local :
 * un client dont la session est valide (/dashboard s'ouvre) ouvre /login ou
 * /register → 200, formulaire avec champ de mot de passe. C'est là que mène
 * « Se connecter » sur e-code.ai à chaque deuxième visite.
 *
 * Les VRAIES routes, contre un vrai serveur HTTP qui joue l'API (aucun module
 * remplacé). Les témoins tiennent les deux pièges : pas de boucle sur un
 * `returnTo`, et l'erreur d'un compte social reste lisible.
 */

let api: Server;
let precedent: string | undefined;
let appelsMoi = 0;

beforeEach(async () => {
  appelsMoi = 0;
  api = createServer((requete, reponse) => {
    const chemin = new URL(requete.url ?? '/', 'http://api.local').pathname;

    reponse.setHeader('content-type', 'application/json');

    if (chemin === '/auth/me') {
      appelsMoi += 1;

      if (requete.headers.authorization === 'Bearer jeton-valide') {
        reponse.end(JSON.stringify({ user: { id: 'user_1', email: 'client@example.com' } }));
      } else {
        reponse.writeHead(401).end(JSON.stringify({ code: 'UNAUTHORIZED' }));
      }

      return;
    }

    if (chemin === '/auth/oauth/providers') {
      reponse.end(JSON.stringify({ providers: [] }));

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

function visite(chemin: string, jeton?: string) {
  return new Request(`http://127.0.0.1:5173${chemin}`, {
    headers: { host: '127.0.0.1:5173', ...(jeton ? { cookie: `vc_session=${jeton}` } : {}) },
  });
}

/** Un loader rend (ou lève) une redirection ; sinon il rend les données du formulaire. */
async function resultat(appel: () => Promise<unknown>) {
  try {
    const sortie = await appel();

    return sortie instanceof Response ? { redirection: sortie.headers.get('location'), statut: sortie.status } : {};
  } catch (erreur) {
    if (erreur instanceof Response) {
      return { redirection: erreur.headers.get('location'), statut: erreur.status };
    }

    throw erreur;
  }
}

const charger = (loader: typeof connexion, request: Request) => () =>
  Promise.resolve(loader({ request, params: {}, context: {} } as never));

describe('un client déjà connecté ne revoit pas le formulaire de connexion', () => {
  it.each([
    ['/login', connexion],
    ['/register', inscription],
    ['/login?lang=fr', connexion],
  ])('%s avec une session valide → son espace de travail', async (chemin, loader) => {
    const sortie = await resultat(charger(loader, visite(chemin, 'jeton-valide')));

    /*
     * Mesuré AVANT correctif : aucune redirection — le formulaire de connexion
     * (ou d'inscription) s'affiche à un client déjà connecté.
     */
    expect(sortie.redirection).toBe('/dashboard');
  });

  it('TÉMOIN — session refusée par l’API (jeton expiré) : le formulaire reste, sans boucle', async () => {
    const sortie = await resultat(charger(connexion, visite('/login', 'jeton-expire')));

    expect(sortie.redirection).toBeUndefined();
    expect(appelsMoi).toBe(1);
  });

  it('TÉMOIN — aucun cookie : le formulaire, et aucun appel réseau pour le dire', async () => {
    const sortie = await resultat(charger(connexion, visite('/login')));

    expect(sortie.redirection).toBeUndefined();
    expect(appelsMoi).toBe(0);
  });

  it('TÉMOIN — retour d’une session expirée (`returnTo`) : pas de renvoi, rien qui puisse boucler', async () => {
    const sortie = await resultat(charger(connexion, visite('/login?returnTo=%2Fprojects', 'jeton-valide')));

    expect(sortie.redirection).toBeUndefined();
  });

  it('TÉMOIN — échec d’un compte social : le message reste lisible, même pour un client connecté', async () => {
    const sortie = await resultat(
      charger(connexion, visite('/login?oauth=github&error=callback_failed', 'jeton-valide')),
    );

    expect(sortie.redirection).toBeUndefined();
  });
});
