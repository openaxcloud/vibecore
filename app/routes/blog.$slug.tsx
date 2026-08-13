import { Newspaper } from 'lucide-react';
import { data as json, type LoaderFunctionArgs, type MetaFunction, useLoaderData } from 'react-router';

import { MarketingStaticPage } from '~/components/marketing/EcodeMarketingPages';
import { toBlogDetailPageDefinition } from '~/lib/marketing/ecode-blog-detail-page';
import { findEcodeBlogPost } from '~/lib/marketing/ecode-public-api-data.server';
import { socialMetaTags } from '~/utils/social-meta';

/**
 * In-repo SSR blog detail page. Reads the `:slug` param, resolves the matching
 * published post from the public blog data, and renders it through the shared
 * marketing page shell. Unknown slugs 404 server-side instead of silently
 * serving a single hardcoded placeholder article.
 */
export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: data ? `${data.title} - E-Code Blog` : 'Blog - E-Code' },
  {
    name: 'description',
    content: data?.excerpt ?? 'The E-Code blog — product updates, engineering and AI development.',
  },
  ...socialMetaTags({
    title: data ? `${data.title} - E-Code Blog` : 'Blog - E-Code',
    description: data?.excerpt ?? 'The E-Code blog — product updates, engineering and AI development.',
  }),
];

export function loader({ params }: LoaderFunctionArgs) {
  const post = findEcodeBlogPost(params.slug);

  if (!post) {
    throw new Response('Blog post not found', { status: 404 });
  }

  return json(
    {
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
    {
      headers: {
        'Cache-Control': 'public, max-age=300',
      },
    },
  );
}

export default function BlogDetailRoute() {
  const post = useLoaderData<typeof loader>();
  const page = toBlogDetailPageDefinition(post, Newspaper);

  return <MarketingStaticPage page={page} />;
}
