import {
  data as json,
  type HeadersFunction,
  type LinksFunction,
  type LoaderFunctionArgs,
  type MetaFunction,
  useLoaderData,
} from 'react-router';

import { SolutionSalesPage } from './SolutionSalesPage';
import {
  toBilingual,
  type BilingualLanguage,
  type SolutionCopyByLanguage,
  type SolutionRouteConfig,
} from './solution-copy';
import { createSolutionTranslator } from './solution-translator';
import { SUPPORTED_LANGUAGES, USER_LANGUAGE_COOKIE, type SupportedLanguage } from '~/lib/i18n/language';

const OPEN_GRAPH_LOCALES = {
  en: 'en_US',
  fr: 'fr_FR',
} as const satisfies Record<BilingualLanguage, string>;

function asSupportedLanguage(value: string | undefined): SupportedLanguage | undefined {
  const primary = value?.trim().toLowerCase().split('-')[0];

  return SUPPORTED_LANGUAGES.includes(primary as SupportedLanguage) ? (primary as SupportedLanguage) : undefined;
}

function languageFromCookie(cookieHeader: string | null): SupportedLanguage | undefined {
  if (!cookieHeader) {
    return undefined;
  }

  for (const segment of cookieHeader.split(';')) {
    const [rawName, ...rawValue] = segment.trim().split('=');

    if (rawName !== USER_LANGUAGE_COOKIE) {
      continue;
    }

    const encoded = rawValue.join('=');

    try {
      return asSupportedLanguage(decodeURIComponent(encoded));
    } catch {
      return asSupportedLanguage(encoded);
    }
  }

  return undefined;
}

function languageFromAcceptHeader(acceptLanguage: string | null): SupportedLanguage | undefined {
  if (!acceptLanguage) {
    return undefined;
  }

  const preferences = acceptLanguage
    .split(',')
    .map((entry, index) => {
      const [tag, ...parameters] = entry.trim().split(';');
      const qualityParameter = parameters.find((parameter) => parameter.trim().startsWith('q='));
      const quality = qualityParameter ? Number.parseFloat(qualityParameter.trim().slice(2)) : 1;

      return { tag, quality: Number.isFinite(quality) ? quality : 0, index };
    })
    .sort((left, right) => right.quality - left.quality || left.index - right.index);

  for (const preference of preferences) {
    if (preference.quality <= 0) {
      continue;
    }

    const language = asSupportedLanguage(preference.tag);

    if (language) {
      return language;
    }
  }

  return undefined;
}

export function resolveSolutionLanguage(request: Request): SupportedLanguage {
  return (
    asSupportedLanguage(new URL(request.url).searchParams.get('lang') ?? undefined) ??
    languageFromCookie(request.headers.get('Cookie')) ??
    languageFromAcceptHeader(request.headers.get('Accept-Language')) ??
    'en'
  );
}

export type SolutionRouteModule = {
  loader: (args: LoaderFunctionArgs) => ReturnType<typeof json>;
  meta: MetaFunction;
  headers: HeadersFunction;
  links: LinksFunction;
  handle: { serverRenderedMarketing: true };
  Component: () => JSX.Element;
};

/**
 * Builds the React Router module exports (loader/meta/headers/links/component)
 * for a declined solution sales page. Mirrors the App Builder route's localized
 * SSR behaviour so every solution page shares one honest, tested code path.
 */
export function makeSolutionRoute(config: SolutionRouteConfig, copy: SolutionCopyByLanguage): SolutionRouteModule {
  function loader({ request }: LoaderFunctionArgs) {
    const language = toBilingual(resolveSolutionLanguage(request));
    const requestedLanguage = asSupportedLanguage(new URL(request.url).searchParams.get('lang') ?? undefined);

    const headers: Record<string, string> = {
      'Content-Language': language,
      Vary: 'Origin, Cookie, Accept-Language',
    };

    if (requestedLanguage) {
      headers['Set-Cookie'] =
        `${USER_LANGUAGE_COOKIE}=${toBilingual(requestedLanguage)}; Path=/; Max-Age=31536000; SameSite=Lax`;
    }

    return json({ language }, { headers });
  }

  const headers: HeadersFunction = ({ loaderHeaders, parentHeaders }) => {
    const responseHeaders = new Headers(parentHeaders);
    const contentLanguage = loaderHeaders.get('Content-Language');

    if (contentLanguage) {
      responseHeaders.set('Content-Language', contentLanguage);
    }

    const setCookie = loaderHeaders.get('Set-Cookie');

    if (setCookie) {
      responseHeaders.set('Set-Cookie', setCookie);
    }

    const varyValues = new Set(
      `${responseHeaders.get('Vary') ?? ''},${loaderHeaders.get('Vary') ?? ''}`
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    );

    if (varyValues.size > 0) {
      responseHeaders.set('Vary', [...varyValues].join(', '));
    }

    return responseHeaders;
  };

  const links: LinksFunction = () => [
    { rel: 'canonical', href: config.canonicalUrl },
    { rel: 'alternate', href: `${config.canonicalUrl}?lang=en`, hrefLang: 'en' },
    { rel: 'alternate', href: `${config.canonicalUrl}?lang=fr`, hrefLang: 'fr' },
    { rel: 'alternate', href: config.canonicalUrl, hrefLang: 'x-default' },
  ];

  const meta: MetaFunction = ({ data }) => {
    const requestedLanguage = (data as { language?: string } | undefined)?.language;
    const translator = createSolutionTranslator(copy, requestedLanguage);
    const { language } = translator;
    const imageAlt = translator.t('seo.ogImageAlt');
    const ogImage = config.ogImage[language];

    const alternateLocales = (['en', 'fr'] as const)
      .filter((candidate) => candidate !== language)
      .map((candidate) => ({ property: 'og:locale:alternate', content: OPEN_GRAPH_LOCALES[candidate] }));

    return [
      { title: translator.t('seo.title') },
      { name: 'description', content: translator.t('seo.description') },
      { name: 'robots', content: 'index,follow' },
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: 'E-Code' },
      { property: 'og:url', content: config.canonicalUrl },
      { property: 'og:locale', content: OPEN_GRAPH_LOCALES[language] },
      ...alternateLocales,
      { property: 'og:title', content: translator.t('seo.title') },
      { property: 'og:description', content: translator.t('seo.description') },
      { property: 'og:image', content: ogImage },
      { property: 'og:image:type', content: 'image/png' },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      { property: 'og:image:alt', content: imageAlt },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: translator.t('seo.title') },
      { name: 'twitter:description', content: translator.t('seo.description') },
      { name: 'twitter:image', content: ogImage },
      { name: 'twitter:image:alt', content: imageAlt },
    ];
  };

  function Component() {
    const { language } = useLoaderData<typeof loader>();
    const translator = createSolutionTranslator(copy, language);

    return <SolutionSalesPage copy={translator.catalogue} language={translator.language} solutionSlug={config.slug} />;
  }

  return { loader, meta, headers, links, handle: { serverRenderedMarketing: true }, Component };
}
