import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loader as catchAllLoader } from './$';
import { loader as slugLoader } from './$slug';
import { INDEXABLE_PUBLIC_PATHS } from './sitemap[.]xml';
import { publicFooterColumns, publicMarketingMenus } from '~/components/dashboard/SaaSLayout';
import {
  MARKETING_SHELL_FOOTER_SECTIONS,
  MARKETING_SHELL_NAV_SECTIONS,
} from '~/components/marketing/ecode-exact/marketing-shell.copy';

/*
 * Décision du 2026-10-11 (balayage des pages hors plan du site) :
 * - /runtime-test et /theme-validation sont des pages de TEST internes, servies en
 *   200 au public, dont rien ne dépend ;
 * - /bounties et /marketing/bounties promettent des « missions rémunérées » alors
 *   qu'aucune route d'API ne réalise cette fonction.
 * Retirées : un vrai 404, pas de redirection (qui ferait croire à un contenu
 * déplacé), aucun contenu de remplacement.
 */
const RETIREES = ['/runtime-test', '/theme-validation', '/bounties', '/marketing/bounties'];

/*
 * Les chemins STATIQUES que servent les fichiers de routes (convention plate de
 * React Router) : un fichier dédié l'emporte toujours sur les attrape-tout.
 */
const cheminsStatiques = () =>
  readdirSync(join(process.cwd(), 'app/routes'))
    .filter((f) => /\.(tsx|ts)$/.test(f) && !/\.spec\.tsx?$/.test(f))
    .map((f) => f.replace(/\.(tsx|ts)$/, ''))
    .filter((base) => !base.split('.').some((s) => s.startsWith('$') || s.startsWith('(')))
    .map(
      (base) =>
        `/${base
          .split('.')
          .filter((s) => s !== '_index' && !s.startsWith('_'))
          .join('/')}`,
    );

const statut = (resultat: unknown) => (resultat as { init?: { status?: number } }).init?.status ?? 200;

const appelerSlug = (slug: string) =>
  slugLoader({
    request: new Request(`https://e-code.ai/${slug}?lang=fr`),
    params: { slug },
    context: {},
  } as Parameters<typeof slugLoader>[0]);

describe('pages internes et promesse de missions retirées du public', () => {
  it('aucun fichier de route dédié ne les sert plus', () => {
    const statiques = cheminsStatiques();

    // Contrôle positif : la mesure voit bien les routes dédiées qui existent.
    expect(statiques).toEqual(expect.arrayContaining(['/marketing/teams', '/marketing/deployments', '/pricing']));

    for (const chemin of RETIREES) {
      expect(statiques, chemin).not.toContain(chemin);
    }
  });

  it('les attrape-tout qui les reçoivent répondent un vrai 404', async () => {
    for (const slug of ['runtime-test', 'theme-validation', 'bounties']) {
      expect(statut(await appelerSlug(slug)), slug).toBe(404);
    }

    // `marketing.$slug` réexporte le loader de `$` : 404 localisé.
    const r = catchAllLoader({
      request: new Request('https://e-code.ai/marketing/bounties?lang=fr'),
      params: { '*': 'marketing/bounties' },
      context: {},
    } as unknown as Parameters<typeof catchAllLoader>[0]);
    expect(statut(r)).toBe(404);
    expect(readFileSync(join(process.cwd(), 'app/routes/marketing.$slug.tsx'), 'utf8')).toContain("from './$'");
  });

  it('contre-épreuve : une page de gabarit voisine reste servie en 200', async () => {
    expect(statut(await appelerSlug('analytics'))).toBe(200);
  });

  it('plus aucun lien ni entrée de plan du site ne pointe vers elles', () => {
    expect(INDEXABLE_PUBLIC_PATHS).not.toContain('/bounties');

    const navIds = [
      ...Object.values(MARKETING_SHELL_NAV_SECTIONS),
      ...Object.values(MARKETING_SHELL_FOOTER_SECTIONS),
    ].flat();
    expect(navIds).not.toContain('bounties');

    // Contrôle positif : la voisine reste au menu.
    expect(navIds).toContain('teams');

    const piedDePage = [
      ...publicFooterColumns.flatMap((c) => c.links.map(([, href]) => href)),
      ...Object.values(publicMarketingMenus).flatMap((m) => m.map(([, href]) => href)),
    ];
    expect(piedDePage).toContain('/marketing/teams');

    for (const chemin of RETIREES) {
      expect(piedDePage, chemin).not.toContain(chemin);
    }
  });
});
