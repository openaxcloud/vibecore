import {
  data as json,
  type HeadersFunction,
  type LinksFunction,
  type LoaderFunctionArgs,
  type MetaFunction,
  useLoaderData,
} from 'react-router';

import { AppBuilderSolutionPage } from '~/components/marketing/solutions/AppBuilderSolutionPage';
import { APP_BUILDER_COPY } from '~/components/marketing/solutions/app-builder.copy';
import { SUPPORTED_LANGUAGES, USER_LANGUAGE_COOKIE, type SupportedLanguage } from '~/lib/i18n/language';

export const APP_BUILDER_CANONICAL_URL = 'https://e-code.ai/solutions/app-builder';
export const APP_BUILDER_OG_IMAGES = {
  en: 'https://e-code.ai/assets/og/solutions/app-builder-en.png',
  fr: 'https://e-code.ai/assets/og/solutions/app-builder-fr.png',
} as const;
export const handle = { serverRenderedMarketing: true } as const;

const OPEN_GRAPH_LOCALES = {
  en: 'en_US',
  fr: 'fr_FR',
  es: 'es_ES',
  ar: 'ar_SA',
} as const satisfies Record<SupportedLanguage, string>;

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

export function resolveAppBuilderLanguage(request: Request): SupportedLanguage {
  return (
    asSupportedLanguage(new URL(request.url).searchParams.get('lang') ?? undefined) ??
    languageFromCookie(request.headers.get('Cookie')) ??
    languageFromAcceptHeader(request.headers.get('Accept-Language')) ??
    'en'
  );
}

export function loader({ request }: LoaderFunctionArgs) {
  const language = resolveAppBuilderLanguage(request);
  const requestedLanguage = asSupportedLanguage(new URL(request.url).searchParams.get('lang') ?? undefined);

  const headers: Record<string, string> = {
    'Content-Language': language,
    Vary: 'Origin, Cookie, Accept-Language',
  };

  if (requestedLanguage) {
    headers['Set-Cookie'] = `${USER_LANGUAGE_COOKIE}=${requestedLanguage}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }

  return json(
    { language },
    {
      headers,
    },
  );
}

export const headers: HeadersFunction = ({ loaderHeaders, parentHeaders }) => {
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

export const links: LinksFunction = () => [
  { rel: 'canonical', href: APP_BUILDER_CANONICAL_URL },
  { rel: 'alternate', href: `${APP_BUILDER_CANONICAL_URL}?lang=en`, hrefLang: 'en' },
  { rel: 'alternate', href: `${APP_BUILDER_CANONICAL_URL}?lang=fr`, hrefLang: 'fr' },
  { rel: 'alternate', href: APP_BUILDER_CANONICAL_URL, hrefLang: 'x-default' },
];

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const language = data?.language ?? 'en';
  const copy = APP_BUILDER_COPY[language];
  const imageAlt = copy.aria.demoLabel;
  const visualLanguage = language === 'fr' ? 'fr' : 'en';
  const ogImage = APP_BUILDER_OG_IMAGES[visualLanguage];

  const alternateLocales = SUPPORTED_LANGUAGES.filter((candidate) => candidate !== language).map((candidate) => ({
    property: 'og:locale:alternate',
    content: OPEN_GRAPH_LOCALES[candidate],
  }));

  return [
    { title: copy.seo.title },
    { name: 'description', content: copy.seo.description },
    { name: 'robots', content: 'index,follow' },
    { property: 'og:type', content: 'website' },
    { property: 'og:site_name', content: 'E-Code' },
    { property: 'og:url', content: APP_BUILDER_CANONICAL_URL },
    { property: 'og:locale', content: OPEN_GRAPH_LOCALES[language] },
    ...alternateLocales,
    { property: 'og:title', content: copy.seo.title },
    { property: 'og:description', content: copy.seo.description },
    { property: 'og:image', content: ogImage },
    { property: 'og:image:type', content: 'image/png' },
    { property: 'og:image:width', content: '1200' },
    { property: 'og:image:height', content: '630' },
    { property: 'og:image:alt', content: imageAlt },
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: copy.seo.title },
    { name: 'twitter:description', content: copy.seo.description },
    { name: 'twitter:image', content: ogImage },
    { name: 'twitter:image:alt', content: imageAlt },
  ];
};

export default function AppBuilderSolutionRoute() {
  const { language } = useLoaderData<typeof loader>();

  return <AppBuilderSolutionPage language={language} />;
}
