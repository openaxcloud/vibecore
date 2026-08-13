import { data as json, type LoaderFunctionArgs, type MetaFunction } from 'react-router';
import { useLoaderData } from 'react-router';
import {
  ExploreMarketingPage,
  type PublicExploreCategory,
  type PublicExploreProject,
} from '~/components/marketing/EcodeExploreGallery';
import { getEcodeTemplateCategories, listEcodeTemplates } from '~/lib/marketing/ecode-template-catalog.server';
import { socialMetaTags } from '~/utils/social-meta';

export const meta: MetaFunction = () => [
  { title: 'Explore - E-Code' },
  {
    name: 'description',
    content: 'Discover real, production-ready projects the E-Code community is building. Fork one to start instantly.',
  },
  ...socialMetaTags({
    title: 'Explore - E-Code',
    description: 'Discover real, production-ready projects the E-Code community is building.',
  }),
];

export async function loader(_args: LoaderFunctionArgs) {
  const categoryList = getEcodeTemplateCategories();
  const categoryNames = new Map(categoryList.map((category) => [category.slug, category.name]));

  const categories: PublicExploreCategory[] = categoryList.map((category) => ({
    slug: category.slug,
    name: category.name,
    count: category.count,
  }));

  /*
   * Real data: the same catalog the templates gallery and the /api/explore/projects
   * endpoint use, projected into the community "published project" shape (stars /
   * forks / runs come straight from each template's real stats).
   */
  const projects: PublicExploreProject[] = listEcodeTemplates({ sortBy: 'trending' }).map((template, index) => ({
    id: index + 1,
    slug: template.slug,
    name: template.name,
    description: template.description,
    language: template.language,
    category: template.category,
    categoryName: categoryNames.get(template.category) ?? template.category,
    tags: template.tags,
    stars: template.stats.stars,
    forks: template.stats.forks,
    runs: template.stats.downloads,
    author: template.author.name ?? template.author.id,
  }));

  return json({ projects, categories });
}

export default function ExploreRoute() {
  const data = useLoaderData<typeof loader>();

  return <ExploreMarketingPage projects={data.projects} categories={data.categories} />;
}
