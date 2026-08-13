import { data as json } from 'react-router';

import { ecodeBlogPosts } from '~/lib/marketing/ecode-public-api-data.server';

export function loader() {
  return json(ecodeBlogPosts, {
    headers: {
      'Cache-Control': 'public, max-age=300',
    },
  });
}
