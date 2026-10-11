import { describe, expect, it } from 'vitest';
import { loader } from './$slug';
import { getEcodeSurfacePage } from '~/components/marketing/EcodeSurfacePages';

/*
 * CONSTAT-PAGES-GABARIT-PUBLIQUES — décision du 2026-10-11 : les quatre pages aux
 * noms de DONNÉES DE DÉMONSTRATION (« SolarTech », « SalesforcePro ») n'ont rien
 * à faire sur le site public. Elles répondaient 200 en production. Retirées : un
 * vrai 404 (avec `noindex`, déjà assuré par la route), pas une redirection qui
 * ferait croire à un contenu déplacé, et aucun contenu de remplacement.
 */

const RETIREES = ['solartech-crm', 'salesforcepro-crm', 'solartech-fortune500-store', 'solartech-ai-chat'];

const appeler = (slug: string) =>
  loader({
    request: new Request(`https://e-code.ai/${slug}?lang=fr`),
    params: { slug },
    context: {},
  } as Parameters<typeof loader>[0]);

const statut = (resultat: unknown) => (resultat as { init?: { status?: number } }).init?.status ?? 200;

describe('pages de démonstration retirées du public', () => {
  for (const slug of RETIREES) {
    it(`/${slug} répond un vrai 404 et n'est plus au registre`, async () => {
      // Mesuré AVANT correctif : 200, page servie.
      expect(statut(await appeler(slug))).toBe(404);
      expect(getEcodeSurfacePage(slug)).toBeUndefined();
    });
  }

  it('contre-épreuve — les autres pages publiques restent servies', async () => {
    for (const slug of ['analytics', 'account', 'secrets']) {
      expect(statut(await appeler(slug)), slug).toBe(200);
      expect(getEcodeSurfacePage(slug), slug).toBeDefined();
    }
  });
});
