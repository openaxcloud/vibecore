import { createServer, type Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { action as inviterDepuisInvitations } from './invitations';
import { action as accepter } from './invitations_.accept';
import { action as inviterDepuisAcces } from './organization-invitations';
import { action as inviterDepuisEquipe } from './organization-members';

/*
 * BUG-QA0930-INVITATION-SANS-PLACE — quand le forfait d'une équipe n'a plus de
 * place, l'API répond 429 QUOTA_EXCEEDED. Ce même statut sert au limiteur de
 * débit, et TOUS les formulaires d'invitation le lisaient comme « trop de
 * tentatives, réessayez » (ou un refus générique, ou le texte anglais brut de
 * l'API). Mesuré le 2026-10-01 en local : le collègue qui accepte lit « Trop de
 * tentatives ont été effectuées. Patientez un instant, puis réessayez. » —
 * réessayer ne libérera jamais de place.
 *
 * Les VRAIES actions de route, contre un vrai serveur HTTP qui joue l'API. Le
 * témoin (un vrai 429 du limiteur) garde « réessayez » là où il est juste.
 */

let api: Server;
let precedent: string | undefined;
let reponseApi: { code: string; error: string } = { code: 'QUOTA_EXCEEDED', error: 'Quota exceeded for team.members' };

beforeEach(async () => {
  api = createServer((_requete, reponse) => {
    reponse.writeHead(429, { 'content-type': 'application/json' }).end(JSON.stringify(reponseApi));
  });

  await new Promise<void>((resolve) => api.listen(0, '127.0.0.1', resolve));
  precedent = process.env.SAAS_API_URL;
  process.env.SAAS_API_URL = `http://127.0.0.1:${(api.address() as { port: number }).port}`;
});

afterEach(async () => {
  reponseApi = { code: 'QUOTA_EXCEEDED', error: 'Quota exceeded for team.members' };

  if (precedent === undefined) {
    delete process.env.SAAS_API_URL;
  } else {
    process.env.SAAS_API_URL = precedent;
  }

  await new Promise<void>((resolve) => api.close(() => resolve()));
});

function requete(chemin: string, champs: Record<string, string>) {
  return new Request(`http://app.local${chemin}${chemin.includes('?') ? '&' : '?'}lang=fr`, {
    method: 'POST',
    headers: {
      cookie: 'vc_session=jeton-de-session; ecode_lang=fr',
      'accept-language': 'fr',
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(champs),
  });
}

/** `data()` de react-router : on lit ce que la page affichera. */
function contenu(resultat: unknown) {
  return JSON.stringify((resultat as { data?: unknown }).data ?? resultat);
}

const appeler = (action: (args: never) => unknown, request: Request) =>
  Promise.resolve(action({ request, params: {}, context: {} } as never)).catch((erreur: unknown) => erreur);

describe('équipe sans place libre : chaque formulaire d’invitation dit la vraie cause', () => {
  it('le collègue qui accepte apprend que l’équipe n’a plus de place — pas « trop de tentatives »', async () => {
    const resultat = await appeler(accepter, requete('/invitations/accept', { token: 'invite_jeton' }));

    expect(contenu(resultat)).toContain('seatLimit');
  });

  it('page Équipe (barre latérale) : le propriétaire lit que son forfait n’a plus de place', async () => {
    const resultat = await appeler(
      inviterDepuisEquipe,
      requete('/organization-members', { intent: 'invite', orgId: 'org_1', email: 'collegue@example.com' }),
    );

    expect(contenu(resultat)).toMatch(/plus de place libre/);
  });

  it('page Invitations : même chose', async () => {
    const resultat = await appeler(
      inviterDepuisInvitations,
      requete('/invitations', { orgId: 'org_1', email: 'collegue@example.com' }),
    );

    expect(contenu(resultat)).toContain('seatLimit');
  });

  it('page Accès de l’organisation : même chose — et jamais le texte anglais brut de l’API', async () => {
    const resultat = await appeler(
      inviterDepuisAcces,
      requete('/organization-invitations', { orgId: 'org_1', email: 'collegue@example.com' }),
    );

    expect(contenu(resultat)).toMatch(/plus de place libre/);
    expect(contenu(resultat)).not.toMatch(/Quota exceeded/);
  });

  it('TÉMOIN — un vrai 429 du limiteur de débit garde « réessayez »', async () => {
    reponseApi = { code: 'RATE_LIMITED', error: 'Too Many Requests' };

    const acceptation = await appeler(accepter, requete('/invitations/accept', { token: 'invite_jeton' }));

    const invitation = await appeler(
      inviterDepuisInvitations,
      requete('/invitations', { orgId: 'org_1', email: 'collegue@example.com' }),
    );

    expect(contenu(acceptation)).toContain('rateLimited');
    expect(contenu(invitation)).toContain('rateLimited');
  });
});
