import { afterEach, describe, expect, it } from 'vitest';
import { resolveApiBaseUrl } from './api-base-url.js';

const VARS = ['API_INTERNAL_URL', 'API_URL', 'SAAS_API_URL', 'API_BASE_URL'] as const;
const saved: Record<string, string | undefined> = {};

for (const v of VARS) {
  saved[v] = process.env[v];
}

afterEach(() => {
  for (const v of VARS) {
    if (saved[v] === undefined) {
      delete process.env[v];
    } else {
      process.env[v] = saved[v];
    }
  }
});

function only(set: Partial<Record<(typeof VARS)[number], string>>) {
  for (const v of VARS) {
    delete process.env[v];
  }

  for (const [k, val] of Object.entries(set)) {
    process.env[k] = val;
  }
}

describe("résolution de l'URL interne de l'API", () => {
  /*
   * Le défaut corrigé : la production ne définit NI API_INTERNAL_URL NI API_URL.
   * Elle fournit SAAS_API_URL et API_BASE_URL. L'ancienne résolution de index.ts
   * ne regardait que les deux premières, donc les quatre jobs internes
   * échouaient à chaque déclenchement pendant que les CronJobs restaient verts.
   */
  it('accepte la configuration RÉELLE de la production (SAAS_API_URL + API_BASE_URL)', () => {
    only({
      SAAS_API_URL: 'http://api.svc.cluster.local:3001',
      API_BASE_URL: 'http://api.svc.cluster.local:3001',
    });

    expect(resolveApiBaseUrl()).toBe('http://api.svc.cluster.local:3001');
  });

  it('respecte l’ordre : les surcharges explicites l’emportent', () => {
    only({ API_INTERNAL_URL: 'http://interne:3001', API_URL: 'http://api:3001', SAAS_API_URL: 'http://saas:3001' });
    expect(resolveApiBaseUrl()).toBe('http://interne:3001');

    only({ API_URL: 'http://api:3001', SAAS_API_URL: 'http://saas:3001' });
    expect(resolveApiBaseUrl()).toBe('http://api:3001');
  });

  it('garde SAAS_API_URL DEVANT API_BASE_URL', () => {
    /*
     * Ordre hérité de deploy-jobs.ts : historiquement API_BASE_URL pouvait
     * pointer sur un port où le Service n'écoute pas. Mesuré aujourd'hui en
     * prod les deux valent la même chose et répondent 200, mais l'ordre est
     * conservé pour les environnements où elles divergeraient.
     */
    only({ SAAS_API_URL: 'http://saas:3001', API_BASE_URL: 'http://base:80' });
    expect(resolveApiBaseUrl()).toBe('http://saas:3001');
  });

  it('rend `undefined` quand AUCUNE variable n’est posée, pour que l’appelant échoue avec son propre message', () => {
    /*
     * Le résolveur ne porte pas de message : chaque job lève le sien, en se
     * nommant, ce qui rend le `failedReason` BullMQ directement exploitable.
     */
    only({});
    expect(resolveApiBaseUrl()).toBeUndefined();
  });
});

describe('robustesse aux valeurs vides', () => {
  it('ignore une variable présente mais VIDE au lieu de la laisser gagner', () => {
    /*
     * Cas réel possible : un template Helm émet `API_INTERNAL_URL: ""` quand sa
     * valeur source n'est pas renseignée. Avec un simple `??`, cette chaîne vide
     * l'emporterait sur SAAS_API_URL et le worker appellerait une URL vide.
     */
    only({ API_INTERNAL_URL: '', SAAS_API_URL: 'http://saas:3001' });
    expect(resolveApiBaseUrl()).toBe('http://saas:3001');
  });

  it('ignore aussi une variable qui ne contient que des espaces', () => {
    only({ API_INTERNAL_URL: '   ', API_URL: '', API_BASE_URL: 'http://base:3001' });
    expect(resolveApiBaseUrl()).toBe('http://base:3001');
  });
});
