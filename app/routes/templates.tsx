import { data as json, type LoaderFunctionArgs, type MetaFunction } from 'react-router';
import { useLoaderData } from 'react-router';
import {
  TemplatesMarketingPage,
  type PublicTemplateCard,
  type PublicTemplateCategory,
} from '~/components/marketing/EcodePublicResourcePages';
import {
  getEcodeTemplateCategories,
  listEcodeTemplates,
  type EcodeTemplate,
  type EcodeTemplateCategory,
} from '~/lib/marketing/ecode-template-catalog.server';

export const meta: MetaFunction = () => [
  { title: 'Templates - E-Code' },
  {
    name: 'description',
    content: 'Public E-Code template gallery powered by real Vibecore starter templates.',
  },
];

export function loader(_args: LoaderFunctionArgs) {
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
