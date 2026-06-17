import type { LoaderFunctionArgs } from 'react-router';

import { json } from '~/lib/enterprise-api.server';
import { getEcodeTemplateCategories } from '~/lib/marketing/ecode-template-catalog.server';

export async function loader(_args: LoaderFunctionArgs) {
  return json(getEcodeTemplateCategories());
}
