import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * BUG-WORKER-001 — les quatre jobs internes du worker (`inactivity.gc`,
 * `metering.objectStorage`, `metering.databaseStorage`, `database.maintenance`)
 * echouaient a CHAQUE declenchement sur :
 *
 *   API_INTERNAL_URL (or API_URL) is required to trigger <job>
 *
 * La variable manquait au configmap. Elle y est desormais, et le dernier echec
 * enregistre dans BullMQ date du 18/08. Mais rien ne l'y tenait : c'est la
 * meme classe que AI_GATEWAY_URL, deja perdu une fois de la meme facon.
 *
 * Regle 15 : un correctif sans test qui le tienne est non livre. Ce garde-fou
 * est au niveau du chart, la ou le defaut peut revenir.
 */
const racine = join(process.cwd());
const configmap = readFileSync(join(racine, 'infra/helm/platform/templates/configmap.yaml'), 'utf8');

describe('BUG-WORKER-001 — le worker doit pouvoir joindre l’API', () => {
  it('API_INTERNAL_URL est declaree dans le configmap de la plateforme', () => {
    expect(configmap).toMatch(/API_INTERNAL_URL:/);
  });

  it('sa valeur pointe vers le Service de l’API, pas vers une adresse publique', () => {
    const ligne = configmap.split('\n').find((l) => l.includes('API_INTERNAL_URL:'));
    expect(ligne, 'API_INTERNAL_URL introuvable').toBeDefined();

    /*
     * Une URL publique ferait sortir le trafic du cluster et retomberait sur
     * l'ingress — donc sur la limitation d'usage, et sur un 429 pour un job
     * interne. Le Service interne ou une valeur templatee sont acceptes.
     */
    expect(ligne).not.toMatch(/https:\/\/api\.e-code\.ai/);
  });
});
