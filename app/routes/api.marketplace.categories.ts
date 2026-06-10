import type { LoaderFunctionArgs } from '@remix-run/cloudflare';

import { json } from '~/lib/enterprise-api.server';
import { getEcodeTemplateCategories } from '~/lib/marketing/ecode-template-catalog.server';

export async function loader(_args: LoaderFunctionArgs) {
  return json(getEcodeTemplateCategories());
}
