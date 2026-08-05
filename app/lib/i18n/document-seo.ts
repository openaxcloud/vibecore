import type { Location, MetaArgs, MetaDescriptor, MetaFunction, UIMatch } from 'react-router';

export type DocumentSeoLinkKey = 'canonical' | 'alternate:en' | 'alternate:fr' | 'alternate:x-default';

export type DocumentSeoOwnership = Readonly<{
  linkKeys: ReadonlySet<DocumentSeoLinkKey>;
  metaKeys: ReadonlySet<string>;
  title?: string;
  description?: string;
}>;

export type RouteMetaModule = Readonly<{
  meta?: MetaFunction | readonly MetaDescriptor[];
  links?: () => readonly Readonly<{ rel?: string; hrefLang?: string }>[];
}>;

type EvaluatedMetaMatch = UIMatch &
  Readonly<{
    meta: MetaDescriptor[];
    error?: unknown;
  }>;

const DOCUMENT_ALTERNATE_LANGUAGES = new Set(['en', 'fr', 'x-default']);

function collectSeoLinkKey(
  descriptor: Readonly<{ rel?: string; hrefLang?: string }>,
  keys: Set<DocumentSeoLinkKey>,
): void {
  if (descriptor.rel === 'canonical') {
    keys.add('canonical');
    return;
  }

  if (descriptor.rel !== 'alternate' || typeof descriptor.hrefLang !== 'string') {
    return;
  }

  const hrefLanguage = descriptor.hrefLang.toLowerCase();

  if (DOCUMENT_ALTERNATE_LANGUAGES.has(hrefLanguage)) {
    keys.add(`alternate:${hrefLanguage}` as DocumentSeoLinkKey);
  }
}

function evaluateLeafMeta({
  matches,
  routeModules,
  location,
  error,
}: Readonly<{
  matches: readonly UIMatch[];
  routeModules: Readonly<Record<string, RouteMetaModule>>;
  location: Location;
  error?: unknown;
}>): MetaDescriptor[] | null {
  let leafMeta: MetaDescriptor[] | null = null;

  const evaluatedMatches: EvaluatedMetaMatch[] = [];

  try {
    for (const match of matches) {
      const routeMeta = routeModules[match.id]?.meta;
      const evaluatedMatch: EvaluatedMetaMatch = { ...match, meta: [], error };

      evaluatedMatches.push(evaluatedMatch);

      let descriptors: MetaDescriptor[];

      if (typeof routeMeta === 'function') {
        descriptors =
          routeMeta({
            data: match.data,
            loaderData: match.loaderData,
            params: match.params,
            location,
            matches: evaluatedMatches as MetaArgs['matches'],
            error,
          }) ?? [];
      } else if (Array.isArray(routeMeta)) {
        descriptors = [...routeMeta];
      } else {
        descriptors = leafMeta ? [...leafMeta] : [];
      }

      leafMeta = descriptors;
      evaluatedMatches[evaluatedMatches.length - 1] = { ...evaluatedMatch, meta: descriptors };
    }
  } catch {
    return null;
  }

  return leafMeta;
}

/**
 * Reproduces React Router's leaf-meta selection for the sole purpose of finding
 * canonical/hreflang links already owned by `<Meta />`.
 *
 * The root document renders fallback SEO links outside `<Meta />` so routes
 * without explicit metadata still receive them. Routes that do publish these
 * links must not receive a second copy from the document shell.
 */
export function resolveLeafDocumentSeoOwnership({
  matches,
  routeModules,
  location,
  errors,
}: Readonly<{
  matches: readonly UIMatch[];
  routeModules: Readonly<Record<string, RouteMetaModule>>;
  location: Location;
  errors?: Readonly<Record<string, unknown>> | null;
}>): DocumentSeoOwnership {
  const linkKeys = new Set<DocumentSeoLinkKey>();
  const metaKeys = new Set<string>();
  const errorMatchIndex = errors ? matches.findIndex((match) => errors[match.id] !== undefined) : -1;
  const activeMatches = errorMatchIndex >= 0 ? matches.slice(0, errorMatchIndex + 1) : matches;
  const error = errorMatchIndex >= 0 ? errors?.[activeMatches[activeMatches.length - 1]!.id] : undefined;

  for (const match of activeMatches) {
    try {
      for (const descriptor of routeModules[match.id]?.links?.() ?? []) {
        collectSeoLinkKey(descriptor, linkKeys);
      }
    } catch {
      /* The framework's <Links /> component remains the source of truth. */
    }
  }

  const leafMeta = evaluateLeafMeta({ matches: activeMatches, routeModules, location, error });

  let title: string | undefined;
  let description: string | undefined;

  for (const descriptor of leafMeta ?? []) {
    if ('title' in descriptor && typeof descriptor.title === 'string') {
      title = descriptor.title;
      metaKeys.add('title');
    }

    if ('name' in descriptor && typeof descriptor.name === 'string') {
      const key = `name:${descriptor.name.toLowerCase()}`;

      metaKeys.add(key);

      if (key === 'name:description' && typeof descriptor.content === 'string') {
        description = descriptor.content;
      }
    }

    if ('property' in descriptor && typeof descriptor.property === 'string') {
      const key = `property:${descriptor.property.toLowerCase()}`;

      metaKeys.add(key);

      if (
        key === 'property:og:locale:alternate' &&
        typeof descriptor.content === 'string' &&
        descriptor.content.length > 0
      ) {
        metaKeys.add(`${key}:${descriptor.content.toLowerCase()}`);
      }
    }

    if (!('tagName' in descriptor) || descriptor.tagName !== 'link') {
      continue;
    }

    collectSeoLinkKey(
      {
        rel: 'rel' in descriptor && typeof descriptor.rel === 'string' ? descriptor.rel : undefined,
        hrefLang: 'hrefLang' in descriptor && typeof descriptor.hrefLang === 'string' ? descriptor.hrefLang : undefined,
      },
      linkKeys,
    );
  }

  return { linkKeys, metaKeys, title, description };
}

export function resolveLeafDocumentSeoLinkKeys(
  args: Parameters<typeof resolveLeafDocumentSeoOwnership>[0],
): ReadonlySet<DocumentSeoLinkKey> {
  return resolveLeafDocumentSeoOwnership(args).linkKeys;
}
