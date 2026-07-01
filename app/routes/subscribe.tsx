import type { LoaderFunctionArgs } from 'react-router';
import { redirect } from '~/lib/enterprise-api.server';

/**
 * Thin entry point the public pricing page links to ("Get Core / Get Pro").
 * Previously the pricing CTA navigated to /subscribe, which did not exist → 404.
 * This forwards to the in-app upgrade flow, preserving the chosen plan + billing
 * interval (monthly/annual) so the user lands on the right plan with the right
 * interval preselected, then confirms and checks out via Stripe.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const plan = url.searchParams.get('plan') ?? 'pro';
  const rawInterval = url.searchParams.get('interval');
  const interval = rawInterval === 'annual' || rawInterval === 'yearly' ? 'annual' : 'monthly';

  return redirect(`/upgrade?plan=${encodeURIComponent(plan)}&interval=${interval}`);
}

// Loader-only route: it always redirects, so no component is rendered.
export default function SubscribeRoute() {
  return null;
}
