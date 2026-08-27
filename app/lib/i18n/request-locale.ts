import {
  AUTO_LANGUAGE_COOKIE,
  normalizeSupportedLanguage,
  USER_LANGUAGE_COOKIE,
  type SupportedLanguage,
} from './language';

export type LocaleResolutionSource = 'query' | 'manual-cookie' | 'automatic-cookie' | 'accept-language' | 'default';

export type RequestLocaleResolution = Readonly<{
  language: SupportedLanguage;
  source: LocaleResolutionSource;
  persistAutomaticChoice: boolean;
  persistManualChoice: boolean;
}>;

export function readCookieValue(cookieHeader: string | null, name: string): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }

  for (const segment of cookieHeader.split(';')) {
    const [rawName, ...rawValue] = segment.trim().split('=');

    if (rawName !== name) {
      continue;
    }

    const value = rawValue.join('=');

    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  return undefined;
}

export function languageFromAcceptHeader(acceptLanguage: string | null): SupportedLanguage | undefined {
  if (!acceptLanguage) {
    return undefined;
  }

  const preferences = acceptLanguage
    .split(',')
    .map((entry, index) => {
      const [tag, ...parameters] = entry.trim().split(';');
      const qualityParameter = parameters.find((parameter) => /^q\s*=/iu.test(parameter.trim()));

      const parsedQuality = qualityParameter
        ? Number.parseFloat(qualityParameter.trim().replace(/^q\s*=\s*/iu, ''))
        : 1;

      const quality = Number.isFinite(parsedQuality) && parsedQuality >= 0 && parsedQuality <= 1 ? parsedQuality : 0;

      const normalized = normalizeSupportedLanguage(tag);
      const language = normalized === 'en' || normalized === 'fr' ? normalized : undefined;

      return { language, quality, index };
    })
    .filter(
      (entry): entry is { language: 'en' | 'fr'; quality: number; index: number } =>
        Boolean(entry.language) && entry.quality > 0,
    )
    .sort((left, right) => right.quality - left.quality || left.index - right.index);

  return preferences[0]?.language;
}

export function resolveRequestLocale(request: Request): RequestLocaleResolution {
  const url = new URL(request.url);
  const requested = normalizeSupportedLanguage(url.searchParams.get('lang'));

  if (requested) {
    return {
      language: requested,
      source: 'query',
      persistAutomaticChoice: false,
      persistManualChoice: true,
    };
  }

  const cookieHeader = request.headers.get('Cookie');
  const manual = normalizeSupportedLanguage(readCookieValue(cookieHeader, USER_LANGUAGE_COOKIE));

  if (manual) {
    return {
      language: manual,
      source: 'manual-cookie',
      persistAutomaticChoice: false,
      persistManualChoice: false,
    };
  }

  const automatic = normalizeSupportedLanguage(readCookieValue(cookieHeader, AUTO_LANGUAGE_COOKIE));

  if (automatic) {
    return {
      /*
       * Automatic detection is deliberately binary for this rollout: French
       * browsers get French and every other browser keeps the English default.
       * Normalizing old `es`/`ar` auto cookies to English also keeps SSR aligned
       * with detectUserLanguage() in the browser.
       */
      language: automatic === 'fr' ? 'fr' : 'en',
      source: 'automatic-cookie',
      persistAutomaticChoice: false,
      persistManualChoice: false,
    };
  }

  const accepted = languageFromAcceptHeader(request.headers.get('Accept-Language'));

  return {
    language: accepted ?? 'en',
    source: accepted ? 'accept-language' : 'default',

    /*
     * Persist only an actual HTTP negotiation result. When Accept-Language is
     * missing or contains no supported locale, the document's early browser
     * boot script must still be able to fall back to navigator.language.
     */
    persistAutomaticChoice: Boolean(accepted),
    persistManualChoice: false,
  };
}

export function serializeLanguageCookie(
  name: typeof USER_LANGUAGE_COOKIE | typeof AUTO_LANGUAGE_COOKIE,
  language: SupportedLanguage,
  requestUrl: string,
): string {
  const url = new URL(requestUrl);
  const secure = url.protocol === 'https:' ? '; Secure' : '';
  const hostname = url.hostname.toLowerCase();
  const domain = hostname === 'e-code.ai' || hostname.endsWith('.e-code.ai') ? '; Domain=.e-code.ai' : '';

  return `${name}=${encodeURIComponent(language)}; Path=/; Max-Age=31536000; SameSite=Lax${domain}${secure}`;
}

export function localeResponseHeaders(request: Request, resolution: RequestLocaleResolution): Headers {
  const headers = new Headers({
    'Content-Language': resolution.language,
    Vary: 'Cookie, Accept-Language',
  });

  if (resolution.persistManualChoice) {
    headers.append('Set-Cookie', serializeLanguageCookie(USER_LANGUAGE_COOKIE, resolution.language, request.url));
  } else if (resolution.persistAutomaticChoice) {
    headers.append('Set-Cookie', serializeLanguageCookie(AUTO_LANGUAGE_COOKIE, resolution.language, request.url));
  }

  return headers;
}
