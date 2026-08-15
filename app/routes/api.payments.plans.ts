import { data as json } from 'react-router';
import { requireBillingEnabled } from '~/lib/billing/require-billing-enabled.server';

import { ecodePaymentPlans } from '~/lib/marketing/ecode-public-api-data.server';

export function loader() {
  // KILL-SWITCH FACTURATION : à OFF cette surface n'existe pas (404 sec).
  requireBillingEnabled();
  return json(ecodePaymentPlans, {
    headers: {
      'Cache-Control': 'public, max-age=300',
    },
  });
}
