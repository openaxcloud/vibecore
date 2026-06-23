import type { LoaderFunctionArgs } from 'react-router';

import { json } from '~/lib/enterprise-api.server';
import { listEcodeTemplates } from '~/lib/marketing/ecode-template-catalog.server';
import { parseLimit } from '~/lib/marketing/marketplace-query';

export async function loader({ request }: LoaderFunctionArgs) {
  const limit = parseLimit(new URL(request.url).searchParams.get('limit'), 5);

  const templates = listEcodeTemplates({ sortBy: 'trending' })
    .filter((template) => template.trending || template.featured)
    .slice(0, limit);

  return json(templates);
}
