import { data as json, redirect, type LoaderFunctionArgs, type MetaFunction } from 'react-router';
import { useLoaderData } from 'react-router';
import {
  TemplatesMarketingPage,
  type PublicTemplateCard,
  type PublicTemplateCategory,
} from '~/components/marketing/EcodePublicResourcePages';
import { hasValidWebSession } from '~/lib/.server/require-session';
import { buildPublicRouteMeta, getPublicRouteSeoCopy } from '~/lib/i18n/catalogs/public-route-seo';
import { localeResponseHeaders, resolveRequestLocale } from '~/lib/i18n/request-locale';
import {
  getEcodeTemplateCategories,
  listEcodeTemplates,
  type EcodeTemplate,
  type EcodeTemplateCategory,
} from '~/lib/marketing/ecode-template-catalog.server';

export const meta: MetaFunction<typeof loader> = ({ data, matches }) => {
  const rootData = matches.find((match) => match.id === 'root')?.data as { language?: string } | undefined;
  const language = data?.language ?? rootData?.language;
  const copy = getPublicRouteSeoCopy(language);

  return buildPublicRouteMeta({
    language,
    pathname: '/templates',
    seo: {
      title: copy['publicRouteSeo.templates.title'],
      description: copy['publicRouteSeo.templates.description'],
      imageAlt: copy['publicRouteSeo.templates.imageAlt'],
    },
  });
};

export async function loader({ request }: LoaderFunctionArgs) {
  const locale = resolveRequestLocale(request);
  const headers = localeResponseHeaders(request, locale);

  /*
   * A signed-in visitor who lands on the public gallery belongs in the in-app
   * templates page (real "Use template" actions), not the marketing twin.
   */
  if (await hasValidWebSession(request)) {
    throw redirect('/dashboard/templates', { headers });
  }

  const categories = getEcodeTemplateCategories(locale.language).map(toPublicCategory);
  const categoryNames = new Map(categories.map((category) => [category.slug, category.name]));

  const templates = listEcodeTemplates({ sortBy: 'trending' }, locale.language).map((template) =>
    toPublicTemplate(template, categoryNames),
  );

  return json({ language: locale.language, categories, templates }, { headers });
}

export default function TemplatesRoute() {
  const data = useLoaderData<typeof loader>();

  return <TemplatesMarketingPage categories={data.categories} templates={data.templates} />;
}

export function toPublicTemplate(
  template: EcodeTemplate,
  categoryNames: Map<string, string> = new Map(),
): PublicTemplateCard {
  const difficulty = {
    beginner: 'easy',
    intermediate: 'medium',
    advanced: 'hard',
  } as const;

  return {
    id: template.id,
    slug: template.slug,
    name: template.name,
    description: template.description,
    category: template.category,
    categoryName: categoryNames.get(template.category) ?? template.category,
    difficulty: difficulty[template.difficulty],
    featured: template.featured,
    trending: template.trending,
    technologies: template.technologies,
    tags: template.tags,
    updatedAt: template.updatedAt,
  };
}

export function toPublicCategory(category: EcodeTemplateCategory): PublicTemplateCategory {
  return {
    slug: category.slug,
    name: category.name,
    count: category.count,
  };
}
