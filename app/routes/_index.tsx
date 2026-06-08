import type { LoaderFunctionArgs, MetaFunction } from '@remix-run/cloudflare';
import { redirect } from '@remix-run/cloudflare';
import LandingOptimized from '~/components/marketing/ecode-exact/pages/LandingOptimized';
import { readSessionToken } from '~/lib/enterprise-api.server';

export const meta: MetaFunction = () => [
  { title: 'E-Code - Build & Deploy Production Apps in Minutes' },
  {
    name: 'description',
    content:
      'E-Code combines AI agents, cloud infrastructure, and enterprise security to deliver Fortune 500 development velocity to every team.',
  },
];

export async function loader({ request }: LoaderFunctionArgs) {
  const host = request.headers.get('host')?.toLowerCase() ?? '';

  if (host === 'app.e-code.ai') {
    return redirect(readSessionToken(request) ? '/dashboard' : '/login');
  }

  return null;
}

export default function Index() {
  return <LandingOptimized />;
}
