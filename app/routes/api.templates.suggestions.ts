import type { LoaderFunctionArgs } from 'react-router';

import { json } from '~/lib/enterprise-api.server';
import { getEcodeTemplateSuggestions } from '~/lib/marketing/ecode-template-catalog.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const params = new URL(request.url).searchParams;
  const limit = Number(params.get('limit') ?? 5);

  return json({
    suggestions: getEcodeTemplateSuggestions(params.get('q'), Number.isFinite(limit) ? limit : 5),
  });
}
