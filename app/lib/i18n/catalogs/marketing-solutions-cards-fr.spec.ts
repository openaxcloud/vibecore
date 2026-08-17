import { describe, expect, it } from 'vitest';
import { getMarketingPageCopy, marketingSolutionCardCopyFr } from './marketing';
import { solutionPages } from '~/components/marketing/EcodeMarketingPages';

/*
 * BUG-I18N-001 : en locale FR, 8 des 9 cartes de /solutions restaient en
 * anglais — seule `enterprise` était traduite. `localizeMarketingPage` passe
 * chaque carte par `getMarketingPageCopy`, qui ne trouvait rien pour ces slugs
 * et renvoyait donc la définition anglaise de `solutionPages` telle quelle.
 *
 * Le garde part de `solutionPages` plutôt que d'une liste figée : ajouter une
 * carte sans sa copie FR fait échouer ce test, au lieu de livrer une carte
 * anglaise au milieu d'une page française.
 */

/** Signaux d'un texte resté en anglais : mots outils qui n'existent pas en français. */
const ENGLISH_MARKERS = /\b(the|and|with|your|from|into|turn|build|ship|deliver|describe|create|design)\b/i;

describe('cartes /solutions en locale FR', () => {
  const slugs = Object.keys(solutionPages);

  it('couvre TOUTES les cartes de solutionPages, sans exception', () => {
    const sansCopieFr = slugs.filter((slug) => getMarketingPageCopy(slug, 'fr') === null);

    expect(sansCopieFr).toEqual([]);
    expect(slugs.length).toBeGreaterThanOrEqual(9);
  });

  it.each(slugs)('rend « %s » en français, titre comme description', (slug) => {
    const copy = getMarketingPageCopy(slug, 'fr');

    expect(copy).not.toBeNull();
    expect(copy!.title.trim()).not.toBe('');
    expect(copy!.description.trim()).not.toBe('');

    /*
     * `title` n'est pas soumis au détecteur d'anglais : plusieurs cartes gardent
     * un nom propre non traduit (« App Builder », « Startups », « Enterprise »),
     * exactement comme le font déjà les pages de détail FR. C'est la DESCRIPTION
     * qui trahit une carte non traduite.
     */
    expect(copy!.description).not.toMatch(ENGLISH_MARKERS);
    expect(copy!.highlights.length).toBeGreaterThan(0);
    expect(copy!.highlights.every((item) => !ENGLISH_MARKERS.test(item))).toBe(true);
  });

  it("laisse l'anglais intact — la copie FR ne doit pas fuiter en locale EN", () => {
    for (const slug of slugs) {
      const en = getMarketingPageCopy(slug, 'en');
      const fr = marketingSolutionCardCopyFr[slug as keyof typeof marketingSolutionCardCopyFr];

      if (en && fr) {
        expect(en.description).not.toBe(fr.description);
      }
    }
  });

  it('reprend la copie FR des pages de détail plutôt qu’une retraduction', async () => {
    /*
     * Contrôle de provenance : la description de chaque carte doit être
     * EXACTEMENT le `fr.seo.description` de la page de détail correspondante.
     * Sans cela, une retraduction divergerait silencieusement du reste du site.
     */
    const sources: Record<string, () => Promise<{ fr: { seo: { description: string } } }>> = {
      'app-builder': async () => (await import('~/components/marketing/solutions/app-builder.copy')).APP_BUILDER_COPY,
      'website-builder': async () =>
        (await import('~/components/marketing/solutions/website-builder.copy')).WEBSITE_BUILDER_COPY,
      'game-builder': async () =>
        (await import('~/components/marketing/solutions/game-builder.copy')).GAME_BUILDER_COPY,
      'dashboard-builder': async () =>
        (await import('~/components/marketing/solutions/dashboard-builder.copy')).DASHBOARD_BUILDER_COPY,
      'chatbot-builder': async () =>
        (await import('~/components/marketing/solutions/chatbot-builder.copy')).CHATBOT_BUILDER_COPY,
      'internal-ai-builder': async () =>
        (await import('~/components/marketing/solutions/internal-ai-builder.copy')).INTERNAL_AI_BUILDER_COPY,
      startups: async () => (await import('~/components/marketing/solutions/startups.copy')).STARTUPS_COPY,
      freelancers: async () => (await import('~/components/marketing/solutions/freelancers.copy')).FREELANCERS_COPY,
    };

    for (const [slug, load] of Object.entries(sources)) {
      const detail = await load();
      const card = marketingSolutionCardCopyFr[slug as keyof typeof marketingSolutionCardCopyFr];

      expect(card.description).toBe(detail.fr.seo.description);
    }
  });
});
