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

export const meta: MetaFunction = () => [{ title: 'Import Git repository - E-Code' }];

type Project = { id: string; slug?: string };

/*
 * Route the import to the matching server endpoint by repository host so one page
 * imports GitHub, GitLab and Bitbucket (each backed by its own per-provider,
 * org-scoped import route). SSH (git@host:org/repo) is normalised to a URL first.
 * Unknown hosts default to the GitHub endpoint (its schema still SSRF-validates).
 */
export function importEndpointForUrl(orgId: string, repositoryUrl: string): string {
  let host = '';

  try {
    host = new URL(repositoryUrl.trim().replace(/^git@([^:]+):/, 'https://$1/')).host.toLowerCase();
  } catch {
    host = '';
  }

  const provider = host.includes('gitlab') ? 'gitlab' : host.includes('bitbucket') ? 'bitbucket' : 'github';

  return `/orgs/${orgId}/projects/import/${provider}`;
}

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
    result = await apiRequest<{ project: Project }>(
      request,
      importEndpointForUrl(organization.id, body.repositoryUrl),
      {
        method: 'POST',
        body: JSON.stringify({
          repositoryUrl: body.repositoryUrl,
          branch: body.branch || undefined,
          name: body.name || undefined,
        }),
      },
    );
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
      title="Import Git repository"
      description="Import a GitHub, GitLab or Bitbucket repository into a persistent project, then open it in the E-Code IDE."
    >
      <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-6">
        <Github className="mb-4 h-6 w-6 text-bolt-elements-textTertiary" aria-hidden />
        {actionData?.error ? <p className="mb-4 text-sm text-[var(--status-error-text)]">{actionData.error}</p> : null}
        <SettingsForm
          submitLabel="Import repository"
          fields={[
            {
              label: 'Repository URL',
              name: 'repositoryUrl',
              placeholder: 'https://github.com | gitlab.com | bitbucket.org / org / repo',
            },
            { label: 'Branch', name: 'branch', placeholder: 'main' },
            { label: 'Project name', name: 'name', placeholder: 'Imported app' },
          ]}
        />
      </div>
    </AppShell>
  );
}
