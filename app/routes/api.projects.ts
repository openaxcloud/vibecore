import type { ActionFunctionArgs } from 'react-router';
import { z } from 'zod';

import { apiRequest, firstOrganization, json } from '~/lib/enterprise-api.server';
import {
  getWebApiRoutesCopy,
  interpolateWebApiCopy,
  webApiErrorResponse,
  webApiLocaleHeaders,
} from '~/lib/i18n/catalogs/web-api-routes';
import { resolveRequestLocale } from '~/lib/i18n/request-locale';
import { getEcodeTemplateById } from '~/lib/marketing/ecode-template-catalog.server';

const createProjectFromPublicTemplateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  templateId: z.string().trim().min(1),
});

type Project = { id: string; slug?: string };

export async function action({ request }: ActionFunctionArgs) {
  const copy = getWebApiRoutesCopy(resolveRequestLocale(request).language);
  const body = createProjectFromPublicTemplateSchema.safeParse(await request.json().catch(() => undefined));

  if (!body.success) {
    return webApiErrorResponse(request, 'TEMPLATE_PROJECT_PAYLOAD_INVALID', 400, { extra: { ok: false } });
  }

  const template = getEcodeTemplateById(body.data.templateId);

  if (!template) {
    return webApiErrorResponse(request, 'TEMPLATE_PROJECT_NOT_FOUND', 404, { extra: { ok: false } });
  }

  const organization = await firstOrganization(request);
  const slug = `${template.slug}-${Date.now().toString(36)}`;

  const result = await apiRequest<{ project: Project }>(request, `/orgs/${organization.id}/projects/from-template`, {
    method: 'POST',
    body: JSON.stringify({
      name: body.data.name?.trim() || template.name,
      slug,
      templateName: template.id,
      description: interpolateWebApiCopy(copy.templateProjectDescription, { name: template.name }),
    }),
  });

  return json({ id: result.project.id, project: result.project }, { headers: webApiLocaleHeaders(request) });
}
