import { useEffect, useState } from 'react';
import type { MetaFunction } from 'react-router';
import { Form, useActionData, useFetcher, useLoaderData, useNavigate, useNavigation } from 'react-router';
import { ProjectShell } from '~/components/dashboard/SaaSLayout';
import { Button } from '~/components/ui/Button';
import {
  apiErrorMessage,
  apiRequest,
  json,
  redirect,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import { projectAction, projectPageLoader } from '~/lib/project-route.server';

type SettingsData = {
  project: { id: string; name: string; description?: string; gitRepositoryUrl?: string; gitDefaultBranch?: string };
};

export const meta: MetaFunction = () => [{ title: 'Project settings - E-Code' }];
export const loader = (args: EnterpriseLoaderArgs) =>
  projectPageLoader<SettingsData>(args, (projectId) => `/projects/${projectId}/settings`);
export const action = (args: EnterpriseActionArgs) =>
  projectAction(args, {
    default: async ({ request, projectId, body }) => {
      try {
        await apiRequest(request, `/projects/${projectId}/settings`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: body.name,
            description: body.description,
            gitRepositoryUrl: body.gitRepositoryUrl || undefined,
            gitDefaultBranch: body.gitDefaultBranch || undefined,
          }),
        });
      } catch (error) {
        /*
         * The API validates the project metadata and may reject invalid names or Git URLs.
         * Surface that message inline instead of throwing to an error boundary.
         * `apiRequest` may throw a redirect Response (e.g. to /login on 401 or the MFA re-auth path
         * on 403); let those propagate so the sign-in/MFA redirect actually happens instead of being
         * swallowed into a broken 3xx json() and a generic inline error on a still-broken form.
         */
        if (error instanceof Response && error.status >= 300 && error.status < 400) {
          throw error;
        }

        const status = error instanceof Response ? error.status : 400;
        const msg = await apiErrorMessage(error, 'Unable to save settings. Check the values and try again.');

        return json({ error: msg }, { status });
      }

      return redirect(`/projects/${projectId}/settings`);
    },
  });

export default function ProjectSettingsPage() {
  const { project } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as { error?: string } | undefined;
  const saving = useNavigation().state === 'submitting';

  return (
    <ProjectShell
      projectId={project.id}
      title="Project settings"
      description="Update persistent project metadata, visibility and runtime preferences."
    >
      <Form
        method="post"
        className="grid gap-4 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-6"
      >
        {actionData?.error ? (
          <p
            className="rounded-md border border-bolt-elements-icon-error bg-bolt-elements-background-depth-1 px-3 py-2 text-sm text-bolt-elements-icon-error"
            role="alert"
          >
            {actionData.error}
          </p>
        ) : null}
        <Field label="Project name" name="name" defaultValue={project.name} required />
        <Field label="Description" name="description" defaultValue={project.description ?? ''} />
        <Field label="Git repository URL" name="gitRepositoryUrl" defaultValue={project.gitRepositoryUrl ?? ''} />
        <Field label="Default branch" name="gitDefaultBranch" defaultValue={project.gitDefaultBranch ?? 'main'} />
        <div>
          <Button type="submit" disabled={saving} aria-busy={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </Form>

      <DangerZone projectId={project.id} projectName={project.name} />
    </ProjectShell>
  );
}

/*
 * Danger zone — permanently delete the project. Guarded by typing the exact
 * project name (Replit/GitHub pattern); posts the real `delete-permanent` intent
 * to the existing project-action route, then returns to the dashboard.
 */
function DangerZone({ projectId, projectName }: { projectId: string; projectName: string }) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const navigate = useNavigate();
  const [confirmName, setConfirmName] = useState('');
  const busy = fetcher.state !== 'idle';
  const canDelete = confirmName === projectName && !busy;

  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data?.ok) {
      navigate('/projects');
    }
  }, [fetcher.state, fetcher.data, navigate]);

  return (
    <section className="mt-6 grid gap-3 rounded-lg border border-bolt-elements-icon-error/40 bg-bolt-elements-background-depth-2 p-6">
      <div>
        <h2 className="text-sm font-semibold text-bolt-elements-icon-error">Danger zone</h2>
        <p className="mt-1 text-sm text-bolt-elements-textSecondary">
          Permanently delete this project and all of its data. This cannot be undone. Type{' '}
          <strong className="font-mono text-bolt-elements-textPrimary">{projectName}</strong> to confirm.
        </p>
      </div>
      <input
        value={confirmName}
        onChange={(event) => setConfirmName(event.target.value)}
        placeholder={projectName}
        aria-label="Type the project name to confirm deletion"
        className="h-10 max-w-sm rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 text-sm outline-none focus:border-bolt-elements-icon-error"
      />
      {fetcher.data?.error ? <p className="text-sm text-bolt-elements-icon-error">{fetcher.data.error}</p> : null}
      <div>
        <button
          type="button"
          disabled={!canDelete}
          onClick={() =>
            fetcher.submit(
              { intent: 'delete-permanent' },
              { method: 'post', action: `/api/projects/${projectId}/project-action` },
            )
          }
          className="rounded-md border border-bolt-elements-icon-error bg-bolt-elements-icon-error/10 px-3 py-2 text-sm font-medium text-bolt-elements-icon-error hover:bg-bolt-elements-icon-error/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'Deleting…' : 'Delete this project'}
        </button>
      </div>
    </section>
  );
}

function Field({
  label,
  name,
  defaultValue,
  required = false,
}: {
  label: string;
  name: string;
  defaultValue: string;
  required?: boolean;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      {label}
      <input
        className="h-10 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 text-sm outline-none focus:border-bolt-elements-focus"
        name={name}
        defaultValue={defaultValue}
        required={required}
      />
    </label>
  );
}
