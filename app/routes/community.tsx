import { json, type LoaderFunctionArgs, type MetaFunction } from '@remix-run/cloudflare';
import { useLoaderData } from '@remix-run/react';
import { toPublicTemplate } from './templates';
import { CommunityMarketingPage, type PublicCommunityPost } from '~/components/marketing/EcodePublicResourcePages';
import { getEcodeTemplateCategories, listEcodeTemplates } from '~/lib/marketing/ecode-template-catalog.server';

export const meta: MetaFunction = () => [
  { title: 'Community - E-Code' },
  {
    name: 'description',
    content: 'Public E-Code builder community page with marketing navigation and template-driven discussion paths.',
  },
];

export function loader(_args: LoaderFunctionArgs) {
  const categories = getEcodeTemplateCategories();
  const categoryNames = new Map(categories.map((category) => [category.slug, category.name]));

  const templates = listEcodeTemplates({ sortBy: 'trending' })
    .slice(0, 8)
    .map((template) => toPublicTemplate(template, categoryNames));
  const posts = templates.slice(0, 6).map<PublicCommunityPost>((template) => ({
    id: `community-${template.slug}`,
    title: `${template.name} implementation notes`,
    summary: `Discuss architecture choices, validation steps and production hardening paths for the ${template.name} starter without exposing private project data.`,
    categoryName: template.categoryName,
    tags: template.tags,
    templateSlug: template.slug,
    updatedAt: template.updatedAt,
  }));

  return json({ posts, templates });
}

export default function CommunityRoute() {
  const data = useLoaderData<typeof loader>();

  return <CommunityMarketingPage posts={data.posts} templates={data.templates} />;
}
