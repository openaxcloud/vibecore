import { AlertCircle, ArrowRight, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  data as json,
  Link,
  useLoaderData,
  useRevalidator,
  type LoaderFunctionArgs,
  type MetaFunction,
} from 'react-router';

import { getLanguageDisplayName, getLanguageIcon } from './templates_.languages.icons';
import { PublicShell } from '~/components/dashboard/SaaSLayout';
import {
  formatTemplatesLanguagesRouteCount,
  formatTemplatesLanguagesRouteNumber,
  formatTemplatesLanguagesRouteSummary,
  getTemplatesLanguagesRouteCopy,
  getTemplatesLanguagesRouteSafeError,
  resolveTemplatesLanguagesRouteLanguage,
} from '~/lib/i18n/catalogs/templates-languages-route';
import { localeResponseHeaders, resolveRequestLocale } from '~/lib/i18n/request-locale';
import { getEcodeTemplateCatalog } from '~/lib/marketing/ecode-template-catalog.server';
import { MARKETING_SITE_URL, socialMetaTags } from '~/utils/social-meta';

const TEMPLATES_LANGUAGES_CANONICAL_URL = `${MARKETING_SITE_URL}/templates/languages`;

type TemplateLanguageCount = Readonly<{ name: string; count: number }>;
type TemplatesLanguagesLoadState = 'ready' | 'error';

function collectTemplateLanguageCounts(language: string): { languages: TemplateLanguageCount[]; total: number } {
  const counts = new Map<string, number>();

  for (const template of getEcodeTemplateCatalog(language)) {
    const templateLanguage = (template.language || 'Other').trim() || 'Other';

    counts.set(templateLanguage, (counts.get(templateLanguage) ?? 0) + 1);
  }

  const languages = [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, 'en'));

  return {
    languages,
    total: languages.reduce((sum, item) => sum + item.count, 0),
  };
}

export function loader({ request }: LoaderFunctionArgs) {
  const requestLocale = resolveRequestLocale(request);
  const language = resolveTemplatesLanguagesRouteLanguage(requestLocale.language);
  const locale = { ...requestLocale, language };
  const headers = localeResponseHeaders(request, locale);

  try {
    const catalog = collectTemplateLanguageCounts(language);

    return json(
      {
        language,
        loadState: 'ready' as TemplatesLanguagesLoadState,
        ...catalog,
      },
      { headers },
    );
  } catch (error) {
    console.error('[templates-languages] catalog unavailable', {
      errorType: error instanceof Error ? error.name : 'UnknownError',
    });

    return json(
      {
        language,
        loadState: 'error' as TemplatesLanguagesLoadState,
        languages: [] as TemplateLanguageCount[],
        total: 0,
      },
      { status: 502, headers },
    );
  }
}

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const language = resolveTemplatesLanguagesRouteLanguage(data?.language);
  const copy = getTemplatesLanguagesRouteCopy(language);

  const seo = {
    title: copy['templatesLanguages.seo.title'],
    description: copy['templatesLanguages.seo.description'],
    imageAlt: copy['templatesLanguages.seo.imageAlt'],
  };

  const social = socialMetaTags(seo).map((tag) => {
    const identifier = 'property' in tag ? tag.property : 'name' in tag ? tag.name : undefined;

    return identifier === 'og:image:alt' || identifier === 'twitter:image:alt'
      ? { ...tag, content: seo.imageAlt }
      : tag;
  });

  return [
    { title: seo.title },
    { name: 'description', content: seo.description },
    ...social,
    { property: 'og:url', content: TEMPLATES_LANGUAGES_CANONICAL_URL },
    { property: 'og:locale', content: language === 'fr' ? 'fr_FR' : 'en_US' },
    { property: 'og:locale:alternate', content: language === 'fr' ? 'en_US' : 'fr_FR' },
    { tagName: 'link', rel: 'canonical', href: TEMPLATES_LANGUAGES_CANONICAL_URL },
    {
      tagName: 'link',
      rel: 'alternate',
      hrefLang: 'en',
      href: `${TEMPLATES_LANGUAGES_CANONICAL_URL}?lang=en`,
    },
    {
      tagName: 'link',
      rel: 'alternate',
      hrefLang: 'fr',
      href: `${TEMPLATES_LANGUAGES_CANONICAL_URL}?lang=fr`,
    },
    {
      tagName: 'link',
      rel: 'alternate',
      hrefLang: 'x-default',
      href: TEMPLATES_LANGUAGES_CANONICAL_URL,
    },
  ];
};

export function getTemplateLanguageDisplayName(name: string, language?: string | null): string {
  const normalized = name.trim().toLowerCase();

  if (normalized === '' || normalized === 'other') {
    return getTemplatesLanguagesRouteCopy(language)['templatesLanguages.language.other'];
  }

  return getLanguageDisplayName(name);
}

function TemplatesLanguagesErrorState({ onRetry }: { onRetry: () => void }) {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getTemplatesLanguagesRouteCopy(language);

  return (
    <div
      className="mt-10 flex min-w-0 flex-col items-start gap-4 rounded-2xl border border-[var(--status-error-border)] bg-[var(--status-error-bg)] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6"
      role="alert"
    >
      <div className="flex min-w-0 items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--status-error-text)]" aria-hidden="true" />
        <div className="min-w-0">
          <h2 className="break-words text-lg font-semibold text-[var(--status-error-text)] [overflow-wrap:anywhere]">
            {copy['templatesLanguages.error.title']}
          </h2>
          <p className="mt-1 break-words text-sm text-[var(--status-error-text)] [overflow-wrap:anywhere] sm:text-base">
            {getTemplatesLanguagesRouteSafeError(language)}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex min-h-11 w-full max-w-full shrink-0 items-center justify-center gap-2 whitespace-normal rounded-md border border-[var(--status-error-border)] bg-[var(--ecode-surface)] px-4 py-2 text-center text-sm font-semibold text-[var(--status-error-text)] transition-colors hover:bg-[var(--ecode-surface-tertiary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ecode-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ecode-background)] motion-reduce:transition-none sm:w-auto"
      >
        <RefreshCw className="h-4 w-4 shrink-0" aria-hidden="true" />
        {copy['templatesLanguages.error.retry']}
      </button>
    </div>
  );
}

function TemplatesLanguagesLoadingState({ language }: { language: string }) {
  const copy = getTemplatesLanguagesRouteCopy(language);

  return (
    <div className="mt-10" role="status" aria-live="polite" aria-busy="true">
      <p className="sr-only">{copy['templatesLanguages.loading']}</p>
      <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4" aria-hidden="true">
        {Array.from({ length: 8 }, (_, index) => (
          <div
            key={index}
            className="h-14 animate-pulse rounded-xl border border-[var(--ecode-border)] bg-[var(--ecode-surface)] motion-reduce:animate-none"
          />
        ))}
      </div>
    </div>
  );
}

export default function TemplatesLanguagesRoute() {
  const { languages, total, loadState } = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  const { i18n } = useTranslation();
  const language = resolveTemplatesLanguagesRouteLanguage(i18n.resolvedLanguage ?? i18n.language);
  const copy = getTemplatesLanguagesRouteCopy(language);
  const isLoading = revalidator.state === 'loading';
  const isEmpty = loadState === 'ready' && languages.length === 0;

  return (
    <PublicShell>
      <main
        className="min-w-0 bg-[var(--ecode-background)] text-[var(--ecode-text)]"
        data-ecode-marketing-page="templates-languages"
        data-testid="page-templates-languages"
      >
        <section
          className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8 sm:py-20 lg:py-24"
          aria-labelledby="templates-languages-heading"
          aria-busy={isLoading}
        >
          <div className="min-w-0">
            <p className="break-words text-sm font-semibold uppercase tracking-wide text-[var(--ecode-accent-text)]">
              {copy['templatesLanguages.hero.eyebrow']}
            </p>
            <h1
              id="templates-languages-heading"
              className="mt-3 max-w-4xl break-words text-3xl font-semibold text-[var(--ecode-text)] [overflow-wrap:anywhere] sm:text-4xl md:text-5xl"
            >
              {copy['templatesLanguages.hero.title']}
            </h1>
            {loadState === 'ready' && !isLoading && !isEmpty ? (
              <p className="mt-4 max-w-3xl break-words text-base leading-relaxed text-[var(--ecode-text-secondary)] [overflow-wrap:anywhere] sm:text-lg">
                {formatTemplatesLanguagesRouteSummary(total, languages.length, language)}
              </p>
            ) : null}
          </div>

          {isLoading ? (
            <TemplatesLanguagesLoadingState language={language} />
          ) : loadState === 'error' ? (
            <TemplatesLanguagesErrorState onRetry={() => revalidator.revalidate()} />
          ) : isEmpty ? (
            <div
              className="mt-10 min-w-0 rounded-2xl border border-[var(--ecode-border)] bg-[var(--ecode-surface)] p-6 text-center sm:p-8"
              role="status"
            >
              <h2 className="break-words text-xl font-semibold text-[var(--ecode-text)] [overflow-wrap:anywhere]">
                {copy['templatesLanguages.empty.title']}
              </h2>
              <p className="mx-auto mt-2 max-w-2xl break-words text-sm leading-relaxed text-[var(--ecode-text-secondary)] [overflow-wrap:anywhere] sm:text-base">
                {copy['templatesLanguages.empty.description']}
              </p>
            </div>
          ) : (
            <ul
              className="mt-10 grid min-w-0 grid-cols-1 gap-3 min-[360px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"
              aria-label={copy['templatesLanguages.list.aria']}
            >
              {languages.map((item) => {
                const { Icon, color } = getLanguageIcon(item.name);
                const displayName = getTemplateLanguageDisplayName(item.name, language);

                return (
                  <li
                    key={item.name}
                    className="flex min-h-14 min-w-0 items-center justify-between gap-2 rounded-xl border border-[var(--ecode-border)] bg-[var(--ecode-surface)] px-4 py-3"
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <Icon className="h-5 w-5 shrink-0" style={{ color }} aria-hidden="true" />
                      <span className="min-w-0 break-words font-medium [overflow-wrap:anywhere]">{displayName}</span>
                    </span>
                    <span
                      className="ml-2 inline-flex shrink-0 items-center rounded-full border border-[var(--ecode-border)] px-2 py-0.5 text-xs font-medium text-[var(--ecode-text-secondary)]"
                      aria-label={formatTemplatesLanguagesRouteCount(item.count, language)}
                    >
                      {formatTemplatesLanguagesRouteNumber(item.count, language)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          {loadState === 'ready' && !isLoading ? (
            <div className="mt-10 flex">
              <Link
                to="/templates"
                className="group inline-flex min-h-11 w-full max-w-full items-center justify-center gap-2 whitespace-normal rounded-full bg-[var(--ecode-accent)] px-5 py-2.5 text-center text-sm font-semibold text-[var(--ecode-accent-contrast)] transition-colors hover:bg-[var(--ecode-accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ecode-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ecode-background)] motion-reduce:transition-none sm:w-auto"
              >
                {copy['templatesLanguages.cta.viewAll']}
                <ArrowRight
                  className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none motion-reduce:transition-none"
                  aria-hidden="true"
                />
              </Link>
            </div>
          ) : null}
        </section>
      </main>
    </PublicShell>
  );
}

export function ErrorBoundary() {
  const { i18n } = useTranslation();
  const language = resolveTemplatesLanguagesRouteLanguage(i18n.resolvedLanguage ?? i18n.language);
  const copy = getTemplatesLanguagesRouteCopy(language);

  return (
    <PublicShell>
      <main
        className="flex min-h-[50vh] min-w-0 items-center bg-[var(--ecode-background)] px-5 py-14 text-[var(--ecode-text)] sm:px-8 sm:py-20"
        data-ecode-marketing-page="templates-languages-error"
      >
        <section
          className="mx-auto w-full max-w-2xl rounded-2xl border border-[var(--status-error-border)] bg-[var(--status-error-bg)] p-6 text-center sm:p-8"
          aria-labelledby="templates-languages-error-heading"
          role="alert"
        >
          <AlertCircle className="mx-auto h-8 w-8 text-[var(--status-error-text)]" aria-hidden="true" />
          <h1
            id="templates-languages-error-heading"
            className="mt-4 break-words text-2xl font-semibold text-[var(--status-error-text)] [overflow-wrap:anywhere]"
          >
            {copy['templatesLanguages.error.title']}
          </h1>
          <p className="mt-2 break-words text-sm leading-relaxed text-[var(--status-error-text)] [overflow-wrap:anywhere] sm:text-base">
            {getTemplatesLanguagesRouteSafeError(language)}
          </p>
          <button
            type="button"
            onClick={() => globalThis.location.reload()}
            className="mt-6 inline-flex min-h-11 max-w-full items-center justify-center gap-2 whitespace-normal rounded-md border border-[var(--status-error-border)] bg-[var(--ecode-surface)] px-5 py-2 text-center text-sm font-semibold text-[var(--status-error-text)] transition-colors hover:bg-[var(--ecode-surface-tertiary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ecode-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ecode-background)] motion-reduce:transition-none"
          >
            <RefreshCw className="h-4 w-4 shrink-0" aria-hidden="true" />
            {copy['templatesLanguages.error.reload']}
          </button>
        </section>
      </main>
    </PublicShell>
  );
}
