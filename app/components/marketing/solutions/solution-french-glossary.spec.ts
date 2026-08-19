import { describe, expect, it } from 'vitest';

import { APP_BUILDER_COPY } from './app-builder.copy';
import { CHATBOT_BUILDER_COPY } from './chatbot-builder.copy';
import { DASHBOARD_BUILDER_COPY } from './dashboard-builder.copy';
import { ENTERPRISE_COPY } from './enterprise.copy';
import { FREELANCERS_COPY } from './freelancers.copy';
import { GAME_BUILDER_COPY } from './game-builder.copy';
import { INTERNAL_AI_BUILDER_COPY } from './internal-ai-builder.copy';
import { STARTUPS_COPY } from './startups.copy';
import { WEBSITE_BUILDER_COPY } from './website-builder.copy';
import { findFrenchAuditResidue, type AuditSemanticEntry } from '~/lib/i18n/catalogs/live-audit-heuristics';
import { marketingSolutionCardCopyEn, marketingSolutionCardCopyFr } from '~/lib/i18n/catalogs/marketing';

/*
 * `tests/e2e/i18n-french-live.spec.ts` applique ces heuristiques au DOM rendu de
 * `/solutions` et de ses neuf pages. Cet audit ne tourne qu'en CI, sur une pile
 * complète, en une heure : la copie française a donc dérivé sans que rien ne le
 * signale — 247 termes du glossaire (`docs/i18n/GLOSSARY_FR.md`) laissés en
 * anglais, dont le nom de page « App Builder » alors que tous ses jumeaux
 * étaient traduits.
 *
 * Ce spec applique EXACTEMENT la même heuristique à la source, en quelques
 * millisecondes. `marketing-french-glossary.spec.ts` couvre les autres
 * catalogues marketing, mais avec une liste de termes plus étroite qui laissait
 * passer `app`, `docs`, `permissions` et `onboarding` : les pages Solutions
 * n'y étaient de toute façon pas importées.
 */

/* Identifiants stables : ce sont des routes ou des ancres, pas de la copie visible. */
const STABLE_IDENTIFIER_KEYS = new Set(['href', 'id', 'slug', 'to', 'url']);

function collectCopy(value: unknown, path: readonly string[] = []): AuditSemanticEntry[] {
  if (typeof value === 'string') {
    const key = path.at(-1);

    if (key && STABLE_IDENTIFIER_KEYS.has(key)) {
      return [];
    }

    const locator = path.join('.');

    return [{ kind: 'text', text: value, locator, semanticKey: locator }];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectCopy(item, [...path, String(index)]));
  }

  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => collectCopy(item, [...path, key]));
  }

  return [];
}

const SOLUTION_PAGES = [
  ['app-builder', APP_BUILDER_COPY],
  ['chatbot-builder', CHATBOT_BUILDER_COPY],
  ['dashboard-builder', DASHBOARD_BUILDER_COPY],
  ['enterprise', ENTERPRISE_COPY],
  ['freelancers', FREELANCERS_COPY],
  ['game-builder', GAME_BUILDER_COPY],
  ['internal-ai-builder', INTERNAL_AI_BUILDER_COPY],
  ['startups', STARTUPS_COPY],
  ['website-builder', WEBSITE_BUILDER_COPY],
] as const;

function formatFindings(findings: ReturnType<typeof findFrenchAuditResidue>): string {
  return findings.map((finding) => `${finding.reason} @ ${finding.locator} — ${finding.text}`).join('\n');
}

describe('French glossary on the Solutions pages', () => {
  it.each(SOLUTION_PAGES)('keeps %s free of the English terms the live audit rejects', (_slug, copy) => {
    const findings = findFrenchAuditResidue(collectCopy(copy.en), collectCopy(copy.fr));

    expect(findings, formatFindings(findings)).toEqual([]);
  });

  it('keeps the /solutions index cards free of the same terms', () => {
    const findings = findFrenchAuditResidue(
      collectCopy(marketingSolutionCardCopyEn),
      collectCopy(marketingSolutionCardCopyFr),
    );

    expect(findings, formatFindings(findings)).toEqual([]);
  });
});
