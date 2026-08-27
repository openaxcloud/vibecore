import { useTranslation } from 'react-i18next';
import { data as json, type LoaderFunctionArgs, type MetaFunction } from 'react-router';

import { MarketingIndexPage, solutionPages } from '~/components/marketing/EcodeMarketingPages';
import {
  buildMarketingSolutionsMeta,
  getMarketingSolutionsRouteCopy,
} from '~/lib/i18n/catalogs/marketing-solutions-route';
import { localeResponseHeaders, resolveRequestLocale } from '~/lib/i18n/request-locale';

/*
 * The locale is resolved server-side (query > cookie > Accept-Language) so the
 * SSR `<html lang>`, `Content-Language` and the SEO metadata below all agree
 * with the copy that is rendered — a client-only flip would leave the crawled
 * markup in the wrong language.
 */
export function loader({ request }: LoaderFunctionArgs) {
  const locale = resolveRequestLocale(request);

  return json({ language: locale.language }, { headers: localeResponseHeaders(request, locale) });
}

export const meta: MetaFunction<typeof loader> = ({ data, matches }) => {
  const rootData = matches.find((match) => match.id === 'root')?.data as { language?: string } | undefined;

  return buildMarketingSolutionsMeta(data?.language ?? rootData?.language);
};

export default function SolutionsIndexRoute() {
  const { i18n } = useTranslation();
  const copy = getMarketingSolutionsRouteCopy(i18n.resolvedLanguage ?? i18n.language);

  return (
    <MarketingIndexPage
      title={copy['marketingSolutions.index.title']}
      description={copy['marketingSolutions.index.description']}
      pages={solutionPages}
    />
  );
}
