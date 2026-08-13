import { data as json, type LoaderFunctionArgs, type MetaFunction } from 'react-router';
import { Link, useLoaderData } from 'react-router';

import { getLanguageDisplayName, getLanguageIcon } from './templates_.languages.icons';
import { PublicShell } from '~/components/dashboard/SaaSLayout';
import { getEcodeTemplateCatalog } from '~/lib/marketing/ecode-template-catalog.server';
import { socialMetaTags } from '~/utils/social-meta';

/**
 * In-repo SSR "browse templates by language" page. Derives the language facets
 * (with counts) from the real E-Code starter-template catalog and surfaces them
 * as an at-a-glance breakdown above a single "View all templates" CTA. The
 * gallery does not yet support a `language` facet, so the per-language entries
 * are presented as non-interactive stats rather than links that would silently
 * land on the identical unfiltered gallery. e-code public shell, responsive.
 * Replaces the external-bundle proxy.
 */
export const meta: MetaFunction = () => [
  { title: 'Templates by language — E-Code' },
  {
    name: 'description',
    content: 'Browse E-Code starter templates by programming language — TypeScript, Python, Go and more.',
  },
  ...socialMetaTags({
    title: 'Templates by language — E-Code',
    description: 'Browse E-Code starter templates by programming language — TypeScript, Python, Go and more.',
  }),
];

export function loader(_args: LoaderFunctionArgs) {
  const counts = new Map<string, number>();

  for (const template of getEcodeTemplateCatalog()) {
    const language = (template.language || 'Other').trim() || 'Other';
    counts.set(language, (counts.get(language) ?? 0) + 1);
  }

  const languages = [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  const total = languages.reduce((sum, language) => sum + language.count, 0);

  return json({ languages, total });
}

export default function TemplatesLanguagesRoute() {
  const { languages, total } = useLoaderData<typeof loader>();

  return (
    <PublicShell>
      <main
        className="bg-[var(--ecode-background)] text-[var(--ecode-text)]"
        data-ecode-marketing-page="templates-languages"
      >
        <section className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
          <p className="text-sm font-semibold uppercase tracking-wide text-[var(--ecode-accent)]">Templates</p>
          <h1 className="mt-3 text-3xl font-semibold sm:text-4xl md:text-5xl">Browse templates by language</h1>
          <p className="mt-4 max-w-2xl text-base text-[var(--ecode-text-muted,#6E7681)] sm:text-lg">
            {total} production starter templates across {languages.length} languages. Open the full gallery to explore
            every template and start building in the IDE.
          </p>

          <ul
            className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
            aria-label="Template count by language"
          >
            {languages.map((language) => {
              const { Icon, color } = getLanguageIcon(language.name);

              return (
                <li
                  key={language.name}
                  className="flex items-center justify-between gap-2 rounded-xl border border-[var(--ecode-border,#E5E7EB)] bg-[var(--ecode-surface,#FFFFFF)] px-4 py-3"
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <Icon className="h-5 w-5 shrink-0" style={{ color }} aria-hidden="true" />
                    <span className="truncate font-medium">{getLanguageDisplayName(language.name)}</span>
                  </span>
                  <span className="ml-2 inline-flex shrink-0 items-center rounded-full border border-[var(--ecode-border,#E5E7EB)] px-2 py-0.5 text-xs font-medium text-[var(--ecode-text-muted,#6E7681)]">
                    {language.count}
                  </span>
                </li>
              );
            })}
          </ul>

          <div className="mt-10">
            <Link
              to="/templates"
              className="inline-flex items-center rounded-full bg-[var(--ecode-accent)] px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              View all templates
            </Link>
          </div>
        </section>
      </main>
    </PublicShell>
  );
}
