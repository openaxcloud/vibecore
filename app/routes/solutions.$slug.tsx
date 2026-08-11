import { useTranslation } from 'react-i18next';
import { data as json, redirect, type LoaderFunctionArgs, type MetaFunction } from 'react-router';

import { MarketingDynamicPage, solutionPages } from '~/components/marketing/EcodeMarketingPages';
import { getMarketingSolutionsRouteCopy } from '~/lib/i18n/catalogs/marketing-solutions-route';
import { localeResponseHeaders, resolveRequestLocale } from '~/lib/i18n/request-locale';

/**
 * Legacy/short solution slugs that must resolve to their canonical page instead
 * of 404ing. Kept as permanent (308) redirects so inbound links and search
 * engines settle on the canonical `*-builder` URL. See BUG-SOL-001.
 */
const SOLUTION_SLUG_ALIASES: Record<string, keyof typeof solutionPages> = {
  'internal-ai': 'internal-ai-builder',
};

/**
 * In-repo SSR solution page (app-builder, website-builder, enterprise, …).
 * Renders the e-code public shell + the marketing page definition from
 * `solutionPages`; unknown slugs 404 server-side. Replaces the external proxy.
 */
export const meta: MetaFunction<typeof loader> = ({ data }) => {
  /*
   * Fallbacks come from the same catalogue the `/solutions` index uses, so a
   * slug served by this dynamic route can never emit English metadata to a
   * French visitor. Each of the six known slugs currently has its own static
   * route file, which React Router matches first — these fallbacks are the
   * safety net for the next slug added without one.
   */
  const copy = getMarketingSolutionsRouteCopy(data?.language);

  return [
    { title: data?.title ? `${data.title} — E-Code` : copy['marketingSolutions.seo.title'] },
    { name: 'description', content: data?.description ?? copy['marketingSolutions.seo.description'] },
  ];
};

export function loader({ params, request }: LoaderFunctionArgs) {
  const slug = params.slug ?? '';

  const canonical = SOLUTION_SLUG_ALIASES[slug];

  if (canonical) {
    throw redirect(`/solutions/${canonical}`, 308);
  }

  const page = solutionPages[slug as keyof typeof solutionPages];

  if (!page) {
    /*
     * No body: the boundary renders its own localized "page introuvable" copy,
     * so any text here is never displayed — it is only serialized into the
     * ErrorResponse payload sent to the browser, which shipped an untranslated
     * English string to French visitors. Dropping it removes that leak without
     * changing the status the client sees.
     */
    throw new Response(null, { status: 404 });
  }

  const locale = resolveRequestLocale(request);

  return json(
    { title: page.title, description: page.description, language: locale.language },
    { headers: localeResponseHeaders(request, locale) },
  );
}

export default function SolutionSlugRoute() {
  const { i18n } = useTranslation();
  const copy = getMarketingSolutionsRouteCopy(i18n.resolvedLanguage ?? i18n.language);

  return <MarketingDynamicPage pages={solutionPages} fallbackTitle={copy['marketingSolutions.index.title']} />;
}
