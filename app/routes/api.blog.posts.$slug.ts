import { data as json, type LoaderFunctionArgs } from 'react-router';

import { findEcodeBlogPost } from '~/lib/marketing/ecode-public-api-data.server';

export function loader({ params }: LoaderFunctionArgs) {
  const post = findEcodeBlogPost(params.slug);

  if (!post) {
    return json({ error: 'Blog post not found' }, { status: 404 });
  }

  return json(post, {
    headers: {
      'Cache-Control': 'public, max-age=300',
    },
  });
}
