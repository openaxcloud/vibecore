import type { LoaderFunctionArgs } from '@remix-run/cloudflare';

import { json } from '~/lib/enterprise-api.server';
import { getEcodeTemplateTags } from '~/lib/marketing/ecode-template-catalog.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const limit = Number(new URL(request.url).searchParams.get('limit') ?? 30);

  return json(getEcodeTemplateTags(Number.isFinite(limit) ? limit : 30));
}
