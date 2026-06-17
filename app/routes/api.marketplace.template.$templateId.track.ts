import type { ActionFunctionArgs } from 'react-router';
import { z } from 'zod';

import { json } from '~/lib/enterprise-api.server';
import { getEcodeTemplateById } from '~/lib/marketing/ecode-template-catalog.server';

const trackTemplateActionSchema = z.object({
  action: z.enum(['view', 'deploy', 'fork', 'share', 'copy']).default('view'),
});

export async function action({ params, request }: ActionFunctionArgs) {
  const templateId = params.templateId;

  if (!templateId || !getEcodeTemplateById(templateId)) {
    return json({ ok: false, error: 'Template not found' }, { status: 404 });
  }

  const payload = trackTemplateActionSchema.safeParse(await request.json().catch(() => ({})));

  if (!payload.success) {
    return json({ ok: false, error: 'Invalid template action' }, { status: 400 });
  }

  return json({ ok: true, accepted: true, templateId, action: payload.data.action }, { status: 202 });
}
