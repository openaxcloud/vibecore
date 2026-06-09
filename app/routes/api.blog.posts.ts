import { json } from '@remix-run/cloudflare';

import { ecodeBlogPosts } from '~/lib/marketing/ecode-public-api-data.server';

export function loader() {
  return json(ecodeBlogPosts, {
    headers: {
      'Cache-Control': 'public, max-age=300',
    },
  });
}
