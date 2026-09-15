import { describe, expect, it } from 'vitest';

import { ACTIONABLE_PANEL_CODES, actionablePanelFailure } from './api.projects.$projectId.ide-panel.$panel';

/*
 * BUG-DEPLOY-DEAD-001 — Avi, 08/09, capture du panneau Déploiements sur
 * iPhone : « le déploiement ne marche pas pour aucun fournisseur et aucun
 * environnement », au-dessus du bandeau « Le service du panneau est
 * temporairement indisponible. Veuillez réessayer. » avec un bouton Réessayer.
 *
 * MESURÉ contre l'API le 08/09, les huit fournisseurs un par un :
 *
 *   static ...................  202 QUEUED — fonctionne
 *   server, vercel, netlify,
 *   github-pages,
 *   cloudflare-pages,
 *   google-cloud-run .........  400 PROVIDER_NOT_CONFIGURED, en nommant très
 *                               exactement les variables absentes
 *   docker ...................  403 ENTERPRISE_DEPLOYMENT_REQUIRED
 *
 * L'API disait donc la vérité. Deux masquages la perdaient en route :
 *
 *  1. côté API — en production la garde jumelle sort en 503, et le
 *     gestionnaire d'erreurs remplace le message de toute erreur >= 500 par un
 *     texte générique, sauf `publicMessage` ;
 *  2. côté web — `ACTIONABLE_PANEL_CODES` ne connaissait pas ces codes, donc
 *     tout retombait sur « temporairement indisponible, réessayez » : faux
 *     (rien n'est temporaire) et inutile (aucun réessai ne peut aboutir tant
 *     que les identifiants n'existent pas).
 *
 * C'est le MÊME défaut que `DATABASE_PROVISION_UNAVAILABLE`, corrigé une fois
 * pour la base de données et jamais généralisé.
 */

/* La forme mesurée en production : le code identifie, `error` porte la phrase. */
const AMONT_503 = {
  error:
    'Deploying to Google Cloud Run requires the following configuration: CLOUD_RUN_BUILD_TRIGGER_URL, GCP_OAUTH_TOKEN. Contact your administrator.',
  code: 'DEPLOYMENT_PROVIDER_NOT_CONFIGURED',
};

/*
 * La forme telle qu'elle ARRIVE au panneau — et non telle que l'API l'émet.
 *
 * Piège rencontré le 08/09, et c'est la raison d'être de ce commentaire :
 * l'API émet bien `{ error: 'PROVIDER_NOT_CONFIGURED', message: '<phrase>' }`,
 * mais `apiRequest` ne relaie que `error` et `code`. Un premier test écrit sur
 * la forme de l'API passait au vert pendant que le chemin réel rendait
 * « PROVIDER_NOT_CONFIGURED » tout court à l'écran. Un test ancré sur une
 * charge utile que le code ne reçoit jamais ne garde rien (règle 4 : vérifier
 * qu'une mesure a bien mesuré quelque chose).
 *
 * `apiRequest` substitue désormais la phrase au jeton ; c'est cette forme-là
 * qui est figée ici, et `enterprise-api.message-lisible.spec.ts` tient la
 * substitution elle-même.
 */
const AMONT_400 = {
  error:
    'Deploying to Vercel requires the following configuration: VERCEL_DEPLOY_HOOK_URL. Contact your administrator.',
  code: 'PROVIDER_NOT_CONFIGURED',
};

describe('déploiement — un fournisseur non configuré se dit, il ne se déguise pas en panne', () => {
  it('garde le message du 503 de production, et ne parle plus de réessayer', () => {
    const echec = actionablePanelFailure(AMONT_503);

    expect(echec, 'un fournisseur non configuré doit passer tel quel').toBeDefined();
    expect(echec!.code).toBe('DEPLOYMENT_PROVIDER_NOT_CONFIGURED');
    expect(echec!.error).toContain('CLOUD_RUN_BUILD_TRIGGER_URL');
    expect(echec!.error).toContain('GCP_OAUTH_TOKEN');
    expect(JSON.stringify(echec)).not.toContain('PANEL_REQUEST_FAILED');
    expect(JSON.stringify(echec)).not.toContain('PANEL_BACKEND_UNAVAILABLE');
  });

  it('reconnaît AUSSI le 400, et rend la phrase — jamais le jeton', () => {
    const echec = actionablePanelFailure(AMONT_400);

    expect(echec, 'c’est la forme que rend la plupart des environnements').toBeDefined();
    expect(echec!.code).toBe('PROVIDER_NOT_CONFIGURED');

    // Le point de tout le correctif : l'utilisateur lit la phrase, pas le jeton.
    expect(echec!.error).toContain('VERCEL_DEPLOY_HOOK_URL');
    expect(echec!.error).not.toBe('PROVIDER_NOT_CONFIGURED');
  });

  it('et si le jeton arrivait SEUL, on ne prétend pas avoir une phrase', () => {
    const echec = actionablePanelFailure({ error: 'PROVIDER_NOT_CONFIGURED', code: 'PROVIDER_NOT_CONFIGURED' });

    expect(echec).toBeDefined();
    expect(echec!.error).toBe('PROVIDER_NOT_CONFIGURED');
  });

  it('laisse passer le refus de plan, qui est lui aussi actionnable', () => {
    expect(ACTIONABLE_PANEL_CODES.has('ENTERPRISE_DEPLOYMENT_REQUIRED')).toBe(true);
  });

  it('ne détourne pas une VRAIE panne : elle doit rester une panne', () => {
    expect(actionablePanelFailure({ error: 'boom', code: 'INTERNAL_SERVER_ERROR' })).toBeUndefined();
    expect(actionablePanelFailure(undefined)).toBeUndefined();
    expect(actionablePanelFailure({ error: 'quelque chose' })).toBeUndefined();
  });
});
