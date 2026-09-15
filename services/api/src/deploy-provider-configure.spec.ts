import { describe, expect, it } from 'vitest';

import { assertDeploymentProviderConfigured } from './deployments.js';

/*
 * BUG-DEPLOY-DEAD-001, moitié API — Avi, 08/09 : « le déploiement ne marche pas
 * pour aucun fournisseur et aucun environnement », devant le bandeau « Le
 * service du panneau est temporairement indisponible. Veuillez réessayer. »
 *
 * En production, un fournisseur sans identifiants est refusé en 503. Or le
 * gestionnaire d'erreurs de l'API remplace le message de TOUTE erreur >= 500
 * par un texte générique, sauf si elle porte un `publicMessage` — le nom du
 * fournisseur et la liste des variables manquantes étaient donc jetés avant
 * même de sortir de l'API. C'est le premier des deux masquages ; le second est
 * tenu par `api.projects.$projectId.ide-panel.deploy-provider-error.spec.ts`.
 *
 * La moitié web vit dans `app/` : un import relatif entre paquets est refusé
 * par le lint, à raison.
 */
describe('un fournisseur non configuré est refusé en disant POURQUOI', () => {
  const production = { NODE_ENV: 'production' } as unknown as NodeJS.ProcessEnv;

  it('porte un `publicMessage` qui nomme le fournisseur et ce qui manque', () => {
    let leve: (Error & { publicMessage?: string; code?: string; statusCode?: number }) | undefined;

    try {
      assertDeploymentProviderConfigured('google-cloud-run', production);
    } catch (error) {
      leve = error as typeof leve;
    }

    expect(leve, 'un fournisseur sans identifiants doit être refusé en production').toBeDefined();
    expect(leve!.statusCode).toBe(503);
    expect(leve!.code).toBe('DEPLOYMENT_PROVIDER_NOT_CONFIGURED');

    expect(leve!.publicMessage, 'sans lui, le message honnête est jeté par le >= 500').toBeDefined();
    expect(leve!.publicMessage).toContain('Google Cloud Run');
    expect(leve!.publicMessage).toContain('CLOUD_RUN_BUILD_TRIGGER_URL');
    expect(leve!.publicMessage).toContain('GCP_OAUTH_TOKEN');
  });

  it('ne cite que des NOMS de variables, jamais une valeur (règle 12)', () => {
    const avecValeurs = {
      NODE_ENV: 'production',
      CLOUD_RUN_BUILD_TRIGGER_URL: 'https://exemple.invalide/declencheur',
    } as unknown as NodeJS.ProcessEnv;

    let leve: (Error & { publicMessage?: string }) | undefined;

    try {
      assertDeploymentProviderConfigured('google-cloud-run', avecValeurs);
    } catch (error) {
      leve = error as typeof leve;
    }

    expect(leve, 'il manque encore GCP_OAUTH_TOKEN').toBeDefined();

    // La variable RENSEIGNÉE ne doit apparaître ni par son nom ni, surtout, par sa valeur.
    expect(leve!.publicMessage).toContain('GCP_OAUTH_TOKEN');
    expect(leve!.publicMessage).not.toContain('exemple.invalide');
    expect(leve!.publicMessage).not.toContain('CLOUD_RUN_BUILD_TRIGGER_URL');
  });

  it('laisse passer un fournisseur qui n’exige rien, et tout fournisseur hors production', () => {
    expect(() => assertDeploymentProviderConfigured('static', production)).not.toThrow();
    expect(() =>
      assertDeploymentProviderConfigured('vercel', { NODE_ENV: 'test' } as unknown as NodeJS.ProcessEnv),
    ).not.toThrow();
  });
});
