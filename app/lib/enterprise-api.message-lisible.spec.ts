import { afterEach, describe, expect, it, vi } from 'vitest';

import { apiRequest } from './enterprise-api.server';

/*
 * BUG-DEPLOY-DEAD-001, troisième couche de masquage — celle qui m'avait
 * échappé, et qui rendait les deux premières corrections invisibles.
 *
 * Certaines routes de l'API mettent le JETON dans `error` et la PHRASE dans
 * `message` :
 *
 *   { error: 'PROVIDER_NOT_CONFIGURED',
 *     message: 'Deploying to Vercel requires the following configuration:
 *               VERCEL_DEPLOY_HOOK_URL. Contact your administrator.' }
 *
 * `apiRequest` ne relayait que `error` et `code` : la seule phrase utile était
 * jetée ICI, avant même d'atteindre la route de panneau. Mesuré sur le chemin
 * réel le 08/09 — après avoir corrigé les deux autres couches, l'action de
 * déploiement rendait encore « PROVIDER_NOT_CONFIGURED » tout court.
 *
 * Ce test tient les DEUX bords : la phrase remplace le jeton, et un `error`
 * déjà rédigé n'est jamais remplacé par autre chose.
 */

function reponse(corps: unknown, status: number) {
  return new Response(JSON.stringify(corps), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const requete = () => new Request('https://exemple.invalide/api/test');

async function erreurDe(corps: unknown, status = 400) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => reponse(corps, status)),
  );

  try {
    await apiRequest(requete(), '/projects/p/deployments', { method: 'POST' });
  } catch (error) {
    if (error instanceof Response) {
      return (await error.json()) as { error?: string; code?: string };
    }

    throw error;
  }

  throw new Error('la requête aurait dû échouer');
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiRequest — la phrase lisible ne doit pas être jetée', () => {
  it('remonte `message` quand `error` n’est qu’un jeton machine', async () => {
    const recu = await erreurDe({
      error: 'PROVIDER_NOT_CONFIGURED',
      message:
        'Deploying to Vercel requires the following configuration: VERCEL_DEPLOY_HOOK_URL. Contact your administrator.',
    });

    expect(recu.error).toContain('VERCEL_DEPLOY_HOOK_URL');
    expect(recu.error, 'l’utilisateur ne doit jamais lire le jeton').not.toBe('PROVIDER_NOT_CONFIGURED');
  });

  it('ne touche PAS un `error` déjà rédigé, même si un `message` l’accompagne', async () => {
    const recu = await erreurDe({
      error: 'Le déploiement a échoué pendant la compilation.',
      message: 'build exited with code 1',
    });

    expect(recu.error).toBe('Le déploiement a échoué pendant la compilation.');
  });

  it('reclasse le jeton en `code` — sinon la panne devient lisible mais ANONYME', async () => {
    /*
     * Sur ces réponses `code` vaut « API_ERROR » : l'identité réelle n'existe
     * que dans `error`. En y substituant la phrase sans reclasser le jeton, on
     * la perdait — et les appelants qui reconnaissent la panne au code
     * retombaient sur le message générique. Mesuré sur le chemin réel : les six
     * fournisseurs non configurés étaient revenus à « n'ont pas pu être
     * chargées ». C'est ce test qui l'attrape.
     */
    const recu = await erreurDe({
      error: 'PROVIDER_NOT_CONFIGURED',
      message: 'Deploying to Netlify requires the following configuration: NETLIFY_BUILD_HOOK_URL.',
      code: 'API_ERROR',
    });

    expect(recu.error).toContain('NETLIFY_BUILD_HOOK_URL');
    expect(recu.code, 'le jeton doit devenir le code, pas disparaître').toBe('PROVIDER_NOT_CONFIGURED');
  });

  it('ne réécrit PAS un code déjà précis', async () => {
    const recu = await erreurDe({
      error: 'DEPLOY_FAILED',
      message: 'La compilation a échoué.',
      code: 'ENTERPRISE_DEPLOYMENT_REQUIRED',
    });

    expect(recu.code).toBe('ENTERPRISE_DEPLOYMENT_REQUIRED');
  });

  it('garde le jeton quand il arrive seul : on n’invente pas de phrase', async () => {
    const recu = await erreurDe({ error: 'PROVIDER_NOT_CONFIGURED', code: 'PROVIDER_NOT_CONFIGURED' });

    expect(recu.error).toBe('PROVIDER_NOT_CONFIGURED');
    expect(recu.code).toBe('PROVIDER_NOT_CONFIGURED');
  });
});
