import { Newspaper } from 'lucide-react';
import { data as json, type LoaderFunctionArgs, type MetaFunction, useLoaderData } from 'react-router';

import { MarketingStaticPage } from '~/components/marketing/EcodeMarketingPages';
import { getRemainingRouteShellsCopy, buildRemainingRouteMeta } from '~/lib/i18n/catalogs/remaining-route-shells';
import { localeResponseHeaders, resolveRequestLocale } from '~/lib/i18n/request-locale';
import { toBlogDetailPageDefinition } from '~/lib/marketing/ecode-blog-detail-page';
import { findEcodeBlogPost } from '~/lib/marketing/ecode-public-api-data.server';

/**
 * In-repo SSR blog detail page. Reads the `:slug` param, resolves the matching
 * published post from the public blog data, and renders it through the shared
 * marketing page shell. Unknown slugs 404 server-side instead of silently
 * serving a single hardcoded placeholder article.
 */
export const meta: MetaFunction<typeof loader> = ({ data, matches, params }) => {
  const rootData = matches.find((match) => match.id === 'root')?.data as { language?: string } | undefined;
  const language = data?.language ?? rootData?.language;
  const copy = getRemainingRouteShellsCopy(language);

  return buildRemainingRouteMeta({
    title: data ? `${data.title} - E-Code Blog` : copy['remainingRoutes.blog.fallbackTitle'],
    description: data?.excerpt ?? copy['remainingRoutes.blog.description'],
    path: `/blog/${encodeURIComponent(params.slug ?? '')}`,
    language,
  });
};

export function loader({ params, request }: LoaderFunctionArgs) {
  const localeResolution = resolveRequestLocale(request);
  const headers = localeResponseHeaders(request, localeResolution);
  const post = findEcodeBlogPost(params.slug, localeResolution.language);

  if (!post) {
    throw new Response(null, { status: 404, headers });
  }

  headers.set('Cache-Control', 'public, max-age=300');

  return json(
    {
      language: localeResolution.language,
      title: post.title,
      excerpt: post.excerpt,
      content: post.content,
      author: post.author,
      authorRole: post.authorRole,
      category: post.category,
      tags: post.tags,
      readTime: post.readTime,
      publishedAt: post.publishedAt,
    },
    { headers },
  );
}

export default function BlogDetailRoute() {
  const post = useLoaderData<typeof loader>();
  const page = toBlogDetailPageDefinition(post, Newspaper, post.language);

  return <MarketingStaticPage page={page} />;
}
