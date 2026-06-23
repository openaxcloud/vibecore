import type { LoaderFunctionArgs } from 'react-router';

import { json } from '~/lib/enterprise-api.server';
import { getEcodeTemplateSuggestions } from '~/lib/marketing/ecode-template-catalog.server';

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 50;

export async function loader({ request }: LoaderFunctionArgs) {
  const params = new URL(request.url).searchParams;
  const rawLimit = Number(params.get('limit') ?? DEFAULT_LIMIT);

  /*
   * Clamp to a non-negative, bounded value. Without this, a negative ?limit
   * reaches slice(0, negative) inside getEcodeTemplateSuggestions and silently
   * drops trailing suggestions instead of returning a bounded list.
   */
  const limit = Number.isFinite(rawLimit) ? Math.max(0, Math.min(MAX_LIMIT, Math.trunc(rawLimit))) : DEFAULT_LIMIT;

  return json({
    suggestions: getEcodeTemplateSuggestions(params.get('q'), limit),
  });
}
