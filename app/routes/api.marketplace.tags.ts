import type { LoaderFunctionArgs } from 'react-router';

import { json } from '~/lib/enterprise-api.server';
import { getEcodeTemplateTags } from '~/lib/marketing/ecode-template-catalog.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const limit = Number(new URL(request.url).searchParams.get('limit') ?? 30);

  return json(getEcodeTemplateTags(Number.isFinite(limit) ? limit : 30));
}
