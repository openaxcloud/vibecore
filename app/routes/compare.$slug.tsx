import { useTranslation } from 'react-i18next';
import { data as json, type LoaderFunctionArgs, type MetaFunction } from 'react-router';

import { comparePages, localizeMarketingPage, MarketingDynamicPage } from '~/components/marketing/EcodeMarketingPages';
import { buildRemainingRouteMeta, getRemainingRouteShellsCopy } from '~/lib/i18n/catalogs/remaining-route-shells';
import { localeResponseHeaders, resolveRequestLocale } from '~/lib/i18n/request-locale';

/**
 * In-repo SSR compare page (E-Code vs <competitor>). Renders the e-code public
 * shell + the marketing page definition from `comparePages`; unknown slugs 404
 * server-side. Replaces the external-bundle proxy.
 */
export const meta: MetaFunction<typeof loader> = ({ data, matches, params }) => {
  const rootData = matches.find((match) => match.id === 'root')?.data as { language?: string } | undefined;
  const language = data?.language ?? rootData?.language;
  const copy = getRemainingRouteShellsCopy(language);

  return buildRemainingRouteMeta({
    /* `data.title` already contains the complete E-Code-versus-competitor title. */
    title: data
      ? `${data.title} — ${copy['remainingRoutes.compare.suffix']}`
      : copy['remainingRoutes.compare.fallbackTitle'],
    description: data?.description ?? copy['remainingRoutes.compare.description'],
    path: `/compare/${encodeURIComponent(params.slug ?? '')}`,
    language,
  });
};

export function loader({ params, request }: LoaderFunctionArgs) {
  const localeResolution = resolveRequestLocale(request);
  const headers = localeResponseHeaders(request, localeResolution);
  const slug = params.slug ?? '';
  const page = comparePages[slug as keyof typeof comparePages];

  if (!page) {
    throw new Response(null, { status: 404, headers });
  }

  const localizedPage = localizeMarketingPage(page, localeResolution.language);

  return json(
    { language: localeResolution.language, title: localizedPage.title, description: localizedPage.description },
    { headers },
  );
}

export default function CompareSlugRoute() {
  const { i18n } = useTranslation();
  const copy = getRemainingRouteShellsCopy(i18n.resolvedLanguage ?? i18n.language);

  return <MarketingDynamicPage pages={comparePages} fallbackTitle={copy['remainingRoutes.compare.fallbackLabel']} />;
}
