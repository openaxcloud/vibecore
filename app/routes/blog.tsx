import { useLoaderData, type MetaFunction } from 'react-router';
import Blog from '~/components/marketing/ecode-exact/pages/Blog';
import { buildBlogListing } from '~/lib/marketing/blog-listing';
import { ecodeBlogPosts } from '~/lib/marketing/ecode-public-api-data.server';
import { socialMetaTags } from '~/utils/social-meta';

export const meta: MetaFunction = () => [
  { title: 'Blog — E-Code' },
  { name: 'description', content: 'The E-Code blog — product updates, engineering and AI development.' },
  ...socialMetaTags({
    path: '/blog',
    title: 'Blog — E-Code',
    description: 'The E-Code blog — product updates, engineering and AI development.',
  }),
];

/*
 * BUG-MKT-011 — la liste est DÉRIVÉE du registre qui sert `/blog/:slug`, et non
 * plus écrite en dur dans le composant. C'est ce qui garantit que tout billet
 * listé est réellement atteignable : les deux vues ne peuvent plus diverger.
 */
export function loader() {
  return buildBlogListing(ecodeBlogPosts);
}

export default function BlogRoute() {
  const { featured, posts, categories } = useLoaderData<typeof loader>();

  return <Blog featured={featured} posts={posts} categories={categories} />;
}
