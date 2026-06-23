import { Github } from 'lucide-react';
import type { MetaFunction } from 'react-router';
import { useActionData } from 'react-router';
import { AppShell, SettingsForm } from '~/components/dashboard/SaaSLayout';
import {
  apiErrorMessage,
  apiRequest,
  firstOrganization,
  firstOrganizationOrNull,
  formObject,
  isApiResponse,
  redirect,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import { isReauthRedirect } from '~/lib/route-reauth';
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

  let result: { project: Project };

  try {
    result = await apiRequest<{ project: Project }>(request, `/orgs/${organization.id}/projects/import/github`, {
      method: 'POST',
      body: JSON.stringify({
        repositoryUrl: body.repositoryUrl,
        branch: body.branch || undefined,
        name: body.name || undefined,
      }),
    });
  } catch (error) {
    /*
     * A 3xx re-auth redirect (session expiry / MFA) must be re-thrown so the
     * framework performs the redirect. Every other API failure — invalid /
     * private / missing repo (400/404), quota exceeded (402), upstream 500 —
     * arrives as a thrown `Response` and should surface inline in the form
     * instead of crashing to the route error boundary.
     */
    if (isReauthRedirect(error)) {
      throw error;
    }

    if (isApiResponse(error)) {
      return { error: await apiErrorMessage(error, 'Failed to import repository.') };
    }

    throw error;
  }

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
