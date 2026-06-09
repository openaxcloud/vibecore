import { json, type LoaderFunctionArgs } from '@remix-run/cloudflare';

import { findEcodeBlogPostsByCategory } from '~/lib/marketing/ecode-public-api-data.server';

export function loader({ params }: LoaderFunctionArgs) {
  return json(findEcodeBlogPostsByCategory(params.category), {
    headers: {
      'Cache-Control': 'public, max-age=300',
    },
  });
}
