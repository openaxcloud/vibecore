import type { MetaFunction } from '@remix-run/cloudflare';
import { useActionData } from '@remix-run/react';
import { Github } from 'lucide-react';
import { AppShell, SettingsForm } from '~/components/dashboard/SaaSLayout';
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

export const meta: MetaFunction = () => [{ title: 'Import GitHub - E-Code' }];

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
  const body = formObject(await request.formData()) as { repositoryUrl?: string; branch?: string; name?: string };

  if (!body.repositoryUrl) {
    return { error: 'Repository URL is required.' };
  }

  const result = await apiRequest<{ project: Project }>(request, `/orgs/${organization.id}/projects/import/github`, {
    method: 'POST',
    body: JSON.stringify({
      repositoryUrl: body.repositoryUrl,
      branch: body.branch || undefined,
      name: body.name || undefined,
    }),
  });

  return redirect(
    projectIdePath({ id: result.project.id, slug: result.project.slug, organizationSlug: organization.slug }),
  );
}

export default function ImportGithubPage() {
  const actionData = useActionData<typeof action>() as { error?: string } | undefined;

  return (
    <AppShell
      title="Import GitHub"
      description="Import a repository into a persistent project, then open it in the Bolt IDE."
    >
      <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-6">
        <Github className="mb-4 h-6 w-6 text-bolt-elements-textTertiary" aria-hidden />
        {actionData?.error ? <p className="mb-4 text-sm text-red-500">{actionData.error}</p> : null}
        <SettingsForm
          submitLabel="Import repository"
          fields={[
            { label: 'Repository URL', name: 'repositoryUrl', placeholder: 'https://github.com/org/repo' },
            { label: 'Branch', name: 'branch', placeholder: 'main' },
            { label: 'Project name', name: 'name', placeholder: 'Imported app' },
          ]}
        />
      </div>
    </AppShell>
  );
}
