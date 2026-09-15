import { describe, expect, it } from 'vitest';
import { disponibiliteDesFournisseurs, type DisponibiliteFournisseur } from './deployments.js';

/*
 * BUG-DEPLOY-PROVIDERS-UI-001 — le serveur SAIT quels hébergeurs peuvent
 * aboutir ; il le dit, pour que l'assistant ne propose que cela.
 *
 * Garde essentielle : le relevé ne porte que des NOMS de variables (règle 12).
 * Une valeur qui fuirait ici partirait droit dans le navigateur.
 */
describe('disponibiliteDesFournisseurs', () => {
  it('« static » n’exige rien : il est toujours utilisable', () => {
    const releve = disponibiliteDesFournisseurs({} as NodeJS.ProcessEnv);
    expect(releve.find((e: DisponibiliteFournisseur) => e.provider === 'static')).toEqual({
      provider: 'static',
      configured: true,
      missingEnv: [],
    });
  });

  it('nomme ce qui manque à un hébergeur non configuré', () => {
    const releve = disponibiliteDesFournisseurs({} as NodeJS.ProcessEnv);
    const vercel = releve.find((e: DisponibiliteFournisseur) => e.provider === 'vercel');
    expect(vercel?.configured).toBe(false);
    expect(vercel?.missingEnv).toEqual(['VERCEL_DEPLOY_HOOK_URL']);
  });

  it('devient utilisable dès que la variable est là', () => {
    const releve = disponibiliteDesFournisseurs({
      VERCEL_DEPLOY_HOOK_URL: 'https://exemple.invalid/crochet',
    } as NodeJS.ProcessEnv);
    const vercel = releve.find((e: DisponibiliteFournisseur) => e.provider === 'vercel');
    expect(vercel).toEqual({ provider: 'vercel', configured: true, missingEnv: [] });
  });

  it('ne rend JAMAIS une valeur, seulement des noms (règle 12)', () => {
    const secret = 'https://crochet.invalid/valeur-tres-secrete-a-ne-pas-divulguer';
    const releve = disponibiliteDesFournisseurs({
      NETLIFY_BUILD_HOOK_URL: secret,
      CLOUDFLARE_DEPLOY_HOOK_URL: secret,
    } as NodeJS.ProcessEnv);

    expect(JSON.stringify(releve)).not.toContain('valeur-tres-secrete');
  });

  it('couvre tous les hébergeurs proposés, sans trou', () => {
    const releve = disponibiliteDesFournisseurs({} as NodeJS.ProcessEnv);
    expect(releve.map((e: DisponibiliteFournisseur) => e.provider)).toEqual([
      'static',
      'server',
      'vercel',
      'netlify',
      'github-pages',
      'cloudflare-pages',
      'google-cloud-run',
      'docker',
    ]);
  });
});
