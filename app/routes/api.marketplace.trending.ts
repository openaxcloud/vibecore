import type { LoaderFunctionArgs } from 'react-router';

import { json } from '~/lib/enterprise-api.server';
import { listEcodeTemplates } from '~/lib/marketing/ecode-template-catalog.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const limit = Number(new URL(request.url).searchParams.get('limit') ?? 5);

  const templates = listEcodeTemplates({ sortBy: 'trending' })
    .filter((template) => template.trending || template.featured)
    .slice(0, Number.isFinite(limit) ? limit : 5);

  return json(templates);
}
