import type { BilingualLanguage, SolutionCopy, SolutionCopyByLanguage } from './solution-copy';

type StringKeyOf<T> = Extract<keyof T, string | number>;

/**
 * Dot-separated paths that can only end on a string in `SolutionCopy`.
 *
 * The page catalogues use tuples for every repeated section, so numeric tuple
 * positions remain part of the contract (`features.items.0.title`, for
 * example) instead of widening to an arbitrary untyped key.
 */
export type StringLeafPath<T> = T extends string
  ? never
  : T extends readonly unknown[]
    ? {
        [Key in Exclude<StringKeyOf<T>, keyof (readonly unknown[])>]: T[Key] extends string
          ? `${Key}`
          : T[Key] extends object
            ? `${Key}.${StringLeafPath<T[Key]>}`
            : never;
      }[Exclude<StringKeyOf<T>, keyof (readonly unknown[])>]
    : T extends object
      ? {
          [Key in StringKeyOf<T>]: T[Key] extends string
            ? `${Key}`
            : T[Key] extends object
              ? `${Key}.${StringLeafPath<T[Key]>}`
              : never;
        }[StringKeyOf<T>]
      : never;

export type SolutionTranslationPath = StringLeafPath<SolutionCopy>;

function readStringAtPath(catalogue: SolutionCopy, path: SolutionTranslationPath): string | undefined {
  let value: unknown = catalogue;

  for (const segment of path.split('.')) {
    if (typeof value !== 'object' || value === null || !(segment in value)) {
      return undefined;
    }

    value = (value as Record<string, unknown>)[segment];
  }

  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function mergeEnglishFallback<T>(english: T, localized: unknown): T {
  if (typeof english === 'string') {
    return (typeof localized === 'string' && localized.trim().length > 0 ? localized : english) as T;
  }

  if (Array.isArray(english)) {
    const localizedArray = Array.isArray(localized) ? localized : [];

    return english.map((entry, index) => mergeEnglishFallback(entry, localizedArray[index])) as T;
  }

  if (typeof english === 'object' && english !== null) {
    const localizedObject = typeof localized === 'object' && localized !== null ? localized : {};
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(english)) {
      result[key] = mergeEnglishFallback(value, (localizedObject as Record<string, unknown>)[key]);
    }

    return result as T;
  }

  return english;
}

export type SolutionTranslator = Readonly<{
  language: BilingualLanguage;

  /** Fully resolved structured catalogue, safe to hand to the page renderer. */
  catalogue: SolutionCopy;

  /** Typed leaf lookup for metadata, ARIA and isolated UI strings. */
  t: (path: SolutionTranslationPath) => string;
}>;

/**
 * Creates the single translation boundary used by solution routes.
 * Unsupported languages resolve to English; missing or blank French leaves
 * fall back individually to the matching English value.
 */
export function createSolutionTranslator(
  catalogues: SolutionCopyByLanguage,
  requestedLanguage: string | undefined,
): SolutionTranslator {
  const language: BilingualLanguage = requestedLanguage === 'fr' ? 'fr' : 'en';
  const localized = catalogues[language];
  const catalogue = language === 'en' ? catalogues.en : mergeEnglishFallback(catalogues.en, localized);

  return {
    language,
    catalogue,
    t(path) {
      return readStringAtPath(localized, path) ?? readStringAtPath(catalogues.en, path) ?? path;
    },
  };
}
