import type { ActionFunctionArgs } from 'react-router';
import { z } from 'zod';

import { json } from '~/lib/enterprise-api.server';
import { remainingApiErrorResponse } from '~/lib/i18n/catalogs/remaining-api-routes';
import { getEcodeTemplateById } from '~/lib/marketing/ecode-template-catalog.server';

const trackTemplateActionSchema = z.object({
  action: z.enum(['view', 'deploy', 'fork', 'share', 'copy']).default('view'),
});

export async function action({ params, request }: ActionFunctionArgs) {
  const templateId = params.templateId;

  if (!templateId || !getEcodeTemplateById(templateId)) {
    return remainingApiErrorResponse(request, 'TEMPLATE_NOT_FOUND', 404, { extra: { ok: false } });
  }

  const payload = trackTemplateActionSchema.safeParse(await request.json().catch(() => ({})));

  if (!payload.success) {
    return remainingApiErrorResponse(request, 'TEMPLATE_ACTION_INVALID', 400, { extra: { ok: false } });
  }

  return json({ ok: true, accepted: true, templateId, action: payload.data.action }, { status: 202 });
}
