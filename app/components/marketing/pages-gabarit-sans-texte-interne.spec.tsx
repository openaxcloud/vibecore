/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import {
  EcodeSurfacePage,
  ecodeAdvancedSurfacePages,
  ecodeStandaloneSurfacePages,
  ecodeSurfacePages,
  type EcodeSurfacePageDefinition,
} from './EcodeSurfacePages';
import { marketingSurfaceCategoryEn, marketingSurfaceCategoryFr } from '~/lib/i18n/catalogs/marketing-surface';
import { createI18nInstance } from '~/lib/i18n/runtime';
import { loader } from '~/routes/$slug';

/*
 * CONSTAT-PAGES-GABARIT-PUBLIQUES — relevé le 2026-10-10 en production :
 * `e-code.ai/plans` et 56 autres pages publiques, servies par un gabarit de
 * remplissage, montraient au visiteur du texte de DÉVELOPPEMENT :
 * « SURFACE D'EXPLOITATION », « ecode route verify /plans », « … est désormais
 * une véritable route E-Code adossée au plan produit importé », « Importé depuis
 * E-Code et affiché dans la navigation publique E-Code »… et aucun prix sur
 * /plans.
 *
 * Ce texte est RETIRÉ, pas remplacé par du texte inventé : les pages gardent
 * leur titre, leur description et leurs points forts, qui sont leur vrai
 * contenu. /plans renvoie vers /pricing, qui porte les prix.
 */

/*
 * Les phrases RETIRÉES, et elles seules. Le mot « surface » apparaît aussi dans
 * la description PROPRE de certaines pages (« A signed-in style home surface… ») :
 * c'est leur contenu, à réécrire par quelqu'un qui le connaît, pas par ce
 * correctif. Il n'est donc pas visé ici.
 */
const PHRASES_RETIREES =
  /ecode route verify|adossée au plan produit|backed by the imported|importé depuis E-Code et affiché|imported from E-Code and rendered|page de compatibilité vide|empty compatibility page|de vraies pages|through real pages|contrôles de production|production controls/iu;

// Les sur-titres de catégorie (« Surface d'exploitation »…), lus dans le catalogue lui-même.
const SUR_TITRES = [marketingSurfaceCategoryEn, marketingSurfaceCategoryFr].flatMap((catalogue) =>
  Object.values(catalogue.surfaceCategories).map((categorie) => categorie.eyebrow),
);

function texteInterne(texte: string): string | undefined {
  return texte.match(PHRASES_RETIREES)?.[0] ?? SUR_TITRES.find((surTitre) => texte.includes(surTitre));
}

afterEach(() => cleanup());

const PAGES: Array<[string, EcodeSurfacePageDefinition]> = [
  ...Object.entries(ecodeSurfacePages),
  ...Object.entries(ecodeAdvancedSurfacePages).map(
    ([cle, page]) => [`advanced/${cle}`, page] as [string, EcodeSurfacePageDefinition],
  ),
  ...Object.values(ecodeStandaloneSurfacePages).map(
    (page) => [page.slug, page] as [string, EcodeSurfacePageDefinition],
  ),
];

/*
 * `PublicShell` rend d'abord un gabarit d'attente (`aria-busy`), puis le contenu
 * après montage. Sans attendre le titre, on lirait une page VIDE — et « aucun
 * texte interne » serait vrai pour une mauvaise raison.
 */
async function rendre(page: EcodeSurfacePageDefinition, langue: 'fr' | 'en') {
  // Routeur de DONNÉES : la coquille publique utilise `useFetcher`, refusé hors d'un tel routeur.
  const routeur = createMemoryRouter([{ path: '/', element: <EcodeSurfacePage page={page} /> }]);

  const vue = render(
    <I18nextProvider i18n={createI18nInstance(langue)}>
      <RouterProvider router={routeur} />
    </I18nextProvider>,
  );

  await screen.findByRole('heading', { level: 1 });

  return vue.container;
}

const SLUGS = PAGES.map(([slug]) => slug);

describe('pages-gabarit publiques — aucun texte de développement', () => {
  it('témoin : les sur-titres sont bien lus dans le catalogue (sinon la garde ne vise rien)', () => {
    expect(SUR_TITRES).toEqual(expect.arrayContaining(['Operations surface', 'Builder surface']));
    expect(SUR_TITRES.length).toBeGreaterThanOrEqual(20);
  });

  it('témoin : les deux registres portent bien les pages relevées en production', () => {
    expect(SLUGS.length).toBeGreaterThanOrEqual(57);
    expect(SLUGS).toEqual(
      expect.arrayContaining(['plans', 'account', 'secrets', 'analytics', 'solartech-crm', 'advanced/sso']),
    );
  });

  for (const langue of ['fr', 'en'] as const) {
    it(`${langue} : aucune des ${SLUGS.length} pages ne montre de texte interne, et chacune garde son titre`, async () => {
      const fautives: string[] = [];

      for (const [slug, page] of PAGES) {
        const corps = await rendre(page, langue);
        const texte = corps.textContent ?? '';

        const trouve = texteInterne(texte);

        if (trouve) {
          fautives.push(`${slug} : « ${trouve} »`);
        }

        // Le vrai contenu reste : un titre de niveau 1 non vide.
        expect(corps.querySelector('h1')?.textContent?.trim(), slug).toBeTruthy();
        cleanup();
      }

      // Témoin : la mesure a bien LU des pages remplies (un rendu vide passerait sinon).
      expect(SLUGS.length).toBeGreaterThan(0);

      // Mesuré AVANT correctif : les 57 pages, dans les deux langues.
      expect(fautives).toEqual([]);
    });
  }
});

describe('/plans renvoie vers /pricing', () => {
  const appeler = (url: string, slug: string) =>
    loader({ request: new Request(url), params: { slug }, context: {} } as Parameters<typeof loader>[0]);

  it('301 vers /pricing, en gardant la langue choisie', async () => {
    const reponse = (await appeler('https://e-code.ai/plans?lang=fr', 'plans').catch((r: unknown) => r)) as Response;

    expect(reponse.status).toBe(301);
    expect(reponse.headers.get('location')).toBe('/pricing?lang=fr');
  });

  it('contre-épreuve — une autre page-gabarit reste servie, et un slug inconnu reste un vrai 404', async () => {
    const servie = await appeler('https://e-code.ai/analytics', 'analytics');
    const inconnue = await appeler('https://e-code.ai/nexiste-pas', 'nexiste-pas');

    expect((servie as { init?: { status?: number } }).init?.status ?? 200).toBe(200);
    expect((inconnue as { init?: { status?: number } }).init?.status).toBe(404);
  });
});
