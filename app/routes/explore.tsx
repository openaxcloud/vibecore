import { data as json, type LoaderFunctionArgs, type MetaFunction } from 'react-router';
import { useLoaderData } from 'react-router';
import {
  ExploreMarketingPage,
  type PublicExploreCategory,
  type PublicExploreProject,
} from '~/components/marketing/EcodeExploreGallery';
import { getPublicGalleryCopy } from '~/lib/i18n/catalogs/public-gallery';
import { localeResponseHeaders, resolveRequestLocale } from '~/lib/i18n/request-locale';
import { getEcodeTemplateCategories, listEcodeTemplates } from '~/lib/marketing/ecode-template-catalog.server';
import { socialMetaTags } from '~/utils/social-meta';

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const copy = getPublicGalleryCopy(data?.language);
  const title = copy['publicGallery.explore.seoTitle'];
  const description = copy['publicGallery.explore.seoDescription'];

  return [
    { title },
    { name: 'description', content: description },
    ...socialMetaTags({
      title,
      description: copy['publicGallery.explore.socialDescription'],
    }),
  ];
};

export async function loader({ request }: LoaderFunctionArgs) {
  const localeResolution = resolveRequestLocale(request);
  const { language } = localeResolution;
  const categoryList = getEcodeTemplateCategories(language);
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
  const projects: PublicExploreProject[] = listEcodeTemplates({ sortBy: 'trending' }, language).map(
    (template, index) => ({
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
    }),
  );

  return json({ projects, categories, language }, { headers: localeResponseHeaders(request, localeResolution) });
}

export default function ExploreRoute() {
  const data = useLoaderData<typeof loader>();

  return <ExploreMarketingPage projects={data.projects} categories={data.categories} />;
}
