import type { ActionFunctionArgs } from 'react-router';
import { z } from 'zod';

import { apiRequest, firstOrganization, json } from '~/lib/enterprise-api.server';
import { getEcodeTemplateById } from '~/lib/marketing/ecode-template-catalog.server';

const createProjectFromPublicTemplateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  templateId: z.string().trim().min(1),
});

type Project = { id: string; slug?: string };

export async function action({ request }: ActionFunctionArgs) {
  const body = createProjectFromPublicTemplateSchema.safeParse(await request.json().catch(() => undefined));

  if (!body.success) {
    return json({ ok: false, error: 'Invalid template project payload' }, { status: 400 });
  }

  const template = getEcodeTemplateById(body.data.templateId);

  if (!template) {
    return json({ ok: false, error: 'Template not found' }, { status: 404 });
  }

  const organization = await firstOrganization(request);
  const slug = `${template.slug}-${Date.now().toString(36)}`;

  const result = await apiRequest<{ project: Project }>(request, `/orgs/${organization.id}/projects/from-template`, {
    method: 'POST',
    body: JSON.stringify({
      name: body.data.name?.trim() || template.name,
      slug,
      templateName: template.id,
      description: `${template.name} starter created from the public E-Code template gallery.`,
    }),
  });

  return json({ id: result.project.id, project: result.project });
}
