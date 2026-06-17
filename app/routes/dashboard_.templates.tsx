import type { MetaFunction } from 'react-router';
import { useActionData } from 'react-router';
import { AppShell, LinkButton, TemplateGallery, templates } from '~/components/dashboard/SaaSLayout';
import {
  apiRequest,
  firstOrganization,
  firstOrganizationOrNull,
  formObject,
  redirect,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import { projectIdePath } from '~/utils/project-url';

export const meta: MetaFunction = () => [{ title: 'Workspace templates - E-Code' }];

type Project = { id: string; slug?: string };

export async function loader({ request }: EnterpriseLoaderArgs) {
  const organization = await firstOrganizationOrNull(request);

  if (!organization) {
    return redirect('/');
  }

  return null;
}

export async function action({ request }: EnterpriseActionArgs) {
  const organization = await firstOrganization(request);
  const body = formObject(await request.formData()) as { templateName?: string; name?: string };
  const selectedTemplate = templates.find((template) => template.id === body.templateName);

  if (!selectedTemplate) {
    return { error: 'Template is not available in this workspace.' };
  }

  const slug = `${selectedTemplate.id}-${Date.now().toString(36)}`;

  const result = await apiRequest<{ project: Project }>(request, `/orgs/${organization.id}/projects/from-template`, {
    method: 'POST',
    body: JSON.stringify({
      name: body.name?.trim() || selectedTemplate.name,
      slug,
      templateName: selectedTemplate.id,
      description: `${selectedTemplate.name} starter created from the private template gallery.`,
    }),
  });

  return redirect(
    projectIdePath({ id: result.project.id, slug: result.project.slug, organizationSlug: organization.slug }),
  );
}

export default function DashboardTemplatesPage() {
  const actionData = useActionData<typeof action>() as { error?: string } | undefined;

  return (
    <AppShell
      title="Templates"
      description="Create production workspaces from curated starters with persistent files, runtime defaults and audit-visible project activity."
      actions={
        <>
          <LinkButton to="/projects/new" variant="outline">
            Blank project
          </LinkButton>
          <LinkButton to="/import-github" variant="outline">
            Import GitHub
          </LinkButton>
        </>
      }
    >
      {actionData?.error ? (
        <p className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {actionData.error}
        </p>
      ) : null}
      <TemplateGallery mode="authenticated" />
    </AppShell>
  );
}
