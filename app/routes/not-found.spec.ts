/**
 * BUG-MKT-005 / BUG-MKT-009 — les deux formes de page introuvable.
 *
 * Le défaut d'origine était subtil : les loaders LEVAIENT une Response 404, et
 * React Router n'exécute pas le `meta` d'une route en erreur. Le HTML SERVI
 * portait donc le titre de la racine sur une page introuvable, et aucun
 * `noindex`. Le symptôme était masqué en navigation interne par un
 * `document.title` posé dans un effet — invisible pour un crawler ou un `curl`.
 *
 * Ces tests verrouillent les DEUX moitiés de l'invariant, car réparer l'une en
 * cassant l'autre est exactement la régression probable :
 *   1. le statut HTTP reste 404 (pas de soft-404 en 200, qui serait indexé) ;
 *   2. le `meta` produit bien titre + `noindex`.
 *
 * L'invariant porté ici est « jamais indexée », donc on vérifie `noindex` et
 * non la variante exacte de la directive : les pages introuvables localisées
 * émettent `noindex,follow` (les robots peuvent suivre les liens sortants sans
 * indexer la page), ce qui satisfait pleinement l'invariant.
 */
import { describe, expect, it } from 'vitest';

import { loader as splatLoader, meta as splatMeta } from './$';
import { meta as slugMeta } from './$slug';
import { ecodeSurfacePages } from '~/components/marketing/EcodeSurfacePages';

const NOT_FOUND_TITLE = 'Page not found · E-Code';

/** `meta` peut renvoyer `undefined` selon sa signature : on le normalise ici. */
type Tags = Array<Record<string, unknown>>;

const asTags = (tags: ReturnType<typeof splatMeta>): Tags => (tags ?? []) as Tags;

const tag = (tags: ReturnType<typeof splatMeta>, name: string) =>
  (asTags(tags).find((t) => t.name === name) as Record<string, string> | undefined)?.content;

const title = (tags: ReturnType<typeof splatMeta>) =>
  (asTags(tags).find((t) => 'title' in t) as { title?: string } | undefined)?.title;

/** `meta` reçoit bien d'autres arguments ; seuls `params` nous concernent ici. */
const metaArgs = (params: Record<string, string>) => ({ params }) as unknown as Parameters<typeof slugMeta>[0];

/** Idem pour le loader : seule la requête compte pour ce qu'on vérifie. */
const loaderArgs = (url: string) =>
  ({ request: new Request(url), params: {}, context: {} }) as unknown as Parameters<typeof splatLoader>[0];

describe('404 multi-segments (route splat)', () => {
  it('renvoie un vrai statut 404 — jamais un soft-404 en 200', async () => {
    const response = await splatLoader(loaderArgs('https://e-code.ai/aa/bb/cc-inexistant'));

    expect(response.init?.status).toBe(404);
  });

  it('produit le titre et le noindex (le `meta` doit s exécuter, donc le loader RENVOIE)', () => {
    const tags = splatMeta(metaArgs({}));

    expect(title(tags)).toBe(NOT_FOUND_TITLE);
    expect(tag(tags, 'robots')).toMatch(/\bnoindex\b/);
  });
});

describe('404 à un segment (route slug — celle qui gère /page-inexistante)', () => {
  it('produit le titre et le noindex pour un slug inconnu', () => {
    const tags = slugMeta(metaArgs({ slug: 'page-inexistante-xyz' }));

    expect(title(tags)).toBe(NOT_FOUND_TITLE);
    expect(tag(tags, 'robots')).toMatch(/\bnoindex\b/);
  });

  it('ne marque PAS en noindex une page de surface qui existe', () => {
    /*
     * Contrôle négatif : sans lui, un `meta` qui renverrait TOUJOURS le bloc
     * « introuvable » passerait les tests ci-dessus tout en désindexant le site.
     * Le slug est PRIS DANS le registre plutôt qu'écrit en dur — un slug codé en
     * main qui serait renommé ferait passer ce contrôle par accident.
     */
    const existingSlug = Object.keys(ecodeSurfacePages)[0];
    expect(existingSlug, 'le registre des surfaces ne doit pas être vide').toBeTruthy();

    const tags = slugMeta(metaArgs({ slug: existingSlug }));

    expect(title(tags)).not.toBe(NOT_FOUND_TITLE);
    expect(tag(tags, 'robots')).toBeUndefined();
  });
});
