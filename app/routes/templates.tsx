import { data as json, redirect, type LoaderFunctionArgs, type MetaFunction } from 'react-router';
import { useLoaderData } from 'react-router';
import {
  TemplatesMarketingPage,
  type PublicTemplateCard,
  type PublicTemplateCategory,
} from '~/components/marketing/EcodePublicResourcePages';
import { hasValidWebSession } from '~/lib/.server/require-session';
import {
  getEcodeTemplateCategories,
  listEcodeTemplates,
  type EcodeTemplate,
  type EcodeTemplateCategory,
} from '~/lib/marketing/ecode-template-catalog.server';
import { socialMetaTags } from '~/utils/social-meta';

export const meta: MetaFunction = () => [
  { title: 'Templates - E-Code' },
  {
    name: 'description',
    content: 'Public E-Code template gallery powered by real E-Code starter templates.',
  },
  ...socialMetaTags({
    title: 'Templates - E-Code',
    description: 'Public E-Code template gallery powered by real E-Code starter templates.',
  }),
];

export async function loader({ request }: LoaderFunctionArgs) {
  /*
   * A signed-in visitor who lands on the public gallery belongs in the in-app
   * templates page (real "Use template" actions), not the marketing twin.
   */
  if (await hasValidWebSession(request)) {
    throw redirect('/dashboard/templates');
  }

  const categories = getEcodeTemplateCategories().map(toPublicCategory);
  const categoryNames = new Map(categories.map((category) => [category.slug, category.name]));

  const templates = listEcodeTemplates({ sortBy: 'trending' }).map((template) =>
    toPublicTemplate(template, categoryNames),
  );

  return json({ categories, templates });
}

export default function TemplatesRoute() {
  const data = useLoaderData<typeof loader>();

  return <TemplatesMarketingPage categories={data.categories} templates={data.templates} />;
}

export function toPublicTemplate(
  template: EcodeTemplate,
  categoryNames: Map<string, string> = new Map(),
): PublicTemplateCard {
  return {
    id: template.id,
    slug: template.slug,
    name: template.name,
    description: template.description,
    category: template.category,
    categoryName: categoryNames.get(template.category) ?? template.category,
    difficulty: template.difficulty,
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
