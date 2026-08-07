export type SecurityServerLanguage = 'en' | 'fr';

const securityServerCopy = {
  en: {
    methodNotAllowed: 'Method not allowed',
    rateLimitExceeded: 'Rate limit exceeded. Please try again later.',
    authenticationFailed: 'Authentication failed',
    unexpectedError: 'An unexpected error occurred',
  },
  fr: {
    methodNotAllowed: 'Méthode non autorisée.',
    rateLimitExceeded: 'Limite de requêtes dépassée. Veuillez réessayer plus tard.',
    authenticationFailed: 'L’authentification a échoué.',
    unexpectedError: 'Une erreur inattendue est survenue.',
  },
} as const;

export type SecurityServerCopyKey = keyof (typeof securityServerCopy)['en'];

export function securityServerMessage(key: SecurityServerCopyKey, language: SecurityServerLanguage = 'en'): string {
  return securityServerCopy[language]?.[key] ?? securityServerCopy.en[key];
}

function cookieValue(cookieHeader: string | null, name: string): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }

  for (const segment of cookieHeader.split(';')) {
    const [rawName, ...rawValue] = segment.trim().split('=');

    if (rawName !== name) {
      continue;
    }

    try {
      return decodeURIComponent(rawValue.join('='));
    } catch {
      return rawValue.join('=');
    }
  }

  return undefined;
}

function supportedLanguage(value: string | null | undefined): SecurityServerLanguage | undefined {
  const primary = value?.trim().toLowerCase().split(/[-_]/)[0];
  return primary === 'fr' ? 'fr' : primary === 'en' ? 'en' : undefined;
}

function languageFromAcceptLanguage(value: string | null): SecurityServerLanguage | undefined {
  if (!value) {
    return undefined;
  }

  return value
    .split(',')
    .map((entry, index) => {
      const [tag, ...parameters] = entry.trim().split(';');
      const qualityRaw = parameters.find((parameter) => parameter.trim().toLowerCase().startsWith('q='));
      const quality = qualityRaw ? Number.parseFloat(qualityRaw.trim().slice(2)) : 1;

      return { language: supportedLanguage(tag), quality: Number.isFinite(quality) ? quality : 0, index };
    })
    .filter(
      (entry): entry is { language: SecurityServerLanguage; quality: number; index: number } =>
        Boolean(entry.language) && entry.quality > 0,
    )
    .sort((left, right) => right.quality - left.quality || left.index - right.index)[0]?.language;
}

/** Manual cookie/query wins; browser negotiation only applies without a saved choice. */
export function securityLanguageForRequest(request: Request): SecurityServerLanguage {
  const url = new URL(request.url);

  const explicit =
    supportedLanguage(url.searchParams.get('lang')) ??
    supportedLanguage(cookieValue(request.headers.get('cookie'), 'vibecore-lang'));

  if (explicit) {
    return explicit;
  }

  return (
    supportedLanguage(cookieValue(request.headers.get('cookie'), 'vibecore-auto-lang')) ??
    languageFromAcceptLanguage(request.headers.get('accept-language')) ??
    'en'
  );
}
