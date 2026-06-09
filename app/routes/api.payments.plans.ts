import { json } from '@remix-run/cloudflare';

import { ecodePaymentPlans } from '~/lib/marketing/ecode-public-api-data.server';

export function loader() {
  return json(ecodePaymentPlans, {
    headers: {
      'Cache-Control': 'public, max-age=300',
    },
  });
}
