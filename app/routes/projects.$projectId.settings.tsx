import * as RadixDialog from '@radix-ui/react-dialog';
import { useEffect, useId, useRef, useState } from 'react';
import type { MetaFunction } from 'react-router';
import { Form, useActionData, useFetcher, useLoaderData, useNavigate, useNavigation } from 'react-router';
import { ProjectShell } from '~/components/dashboard/SaaSLayout';
import { Button } from '~/components/ui/Button';
import { Dialog, DialogDescription, DialogTitle } from '~/components/ui/Dialog';
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
  project: {
    id: string;
    name: string;
    slug?: string;
    description?: string;
    gitRepositoryUrl?: string;
    gitDefaultBranch?: string;
  };
};

export const meta: MetaFunction = () => [{ title: 'Project settings - E-Code' }];
export { UserAreaRouteErrorBoundary as ErrorBoundary } from '~/components/dashboard/UserAreaRouteError';
export const loader = (args: EnterpriseLoaderArgs) =>
  projectPageLoader<SettingsData>(args, (projectId) => `/projects/${projectId}/settings`);
export const action = (args: EnterpriseActionArgs) =>
  projectAction(args, {
    /* Metadata (name / description / git) — a full <Form> submit that redirects on success. */
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

    /*
     * Slug rename (F13) — a fetcher submit so its success/error stay scoped to
     * the slug card. The API mints a 30-day redirect from the old slug and
     * returns 409 PROJECT_SLUG_TAKEN on a clash; surface it inline.
     */
    'rename-slug': async ({ request, projectId, body }) => {
      try {
        const result = await apiRequest<{ project: { slug?: string } }>(request, `/projects/${projectId}/settings`, {
          method: 'PATCH',
          body: JSON.stringify({ slug: body.slug }),
        });

        return json({ ok: true, slug: result.project?.slug });
      } catch (error) {
        if (error instanceof Response && error.status >= 300 && error.status < 400) {
          throw error;
        }

        const status = error instanceof Response ? error.status : 400;
        const msg = await apiErrorMessage(error, 'Unable to rename the project URL. Try a different slug.');

        return json({ ok: false, error: msg }, { status });
      }
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
          <Button type="submit" variant="primary" disabled={saving} aria-busy={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </Form>

      <SlugCard slug={project.slug ?? ''} />

      <DangerZone projectId={project.id} projectName={project.name} />
    </ProjectShell>
  );
}

/*
 * Slug rename card (F13). Renaming persists a 30-day redirect from the old
 * canonical URL to the new one, so existing links keep working during the
 * transition. Uses a fetcher so validation/success stays local to this card.
 */
function SlugCard({ slug }: { slug: string }) {
  const fetcher = useFetcher<{ ok?: boolean; slug?: string; error?: string }>();
  const [value, setValue] = useState(slug);
  const busy = fetcher.state !== 'idle';
  const inputId = useId();

  /* Keep the field in sync once the loader revalidates with the renamed slug. */
  useEffect(() => {
    setValue(slug);
  }, [slug]);

  const normalized = value
    .toLowerCase()
    .trim()
    .replace(/^@+/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  const changed = normalized.length >= 2 && normalized !== slug;
  const justRenamed = fetcher.state === 'idle' && fetcher.data?.ok === true;

  return (
    <fetcher.Form
      method="post"
      className="mt-6 grid gap-3 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-6"
    >
      <input type="hidden" name="intent" value="rename-slug" />
      <div>
        <h2 className="text-sm font-semibold text-bolt-elements-textPrimary">Project URL slug</h2>
        <p className="mt-1 text-sm text-bolt-elements-textSecondary">
          Changing the slug updates the project&apos;s canonical URL. The old URL keeps redirecting here for 30 days so
          existing links don&apos;t break.
        </p>
      </div>
      <label htmlFor={inputId} className="grid gap-2 text-sm font-medium">
        Slug
        <input
          id={inputId}
          name="slug"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          spellCheck={false}
          autoCapitalize="none"
          placeholder="my-project"
          className="h-10 max-w-md rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 font-mono text-sm outline-none focus:border-[var(--vc-ide-accent-action)]"
        />
      </label>
      {normalized && normalized !== value ? (
        <p className="text-xs text-bolt-elements-textTertiary">
          Will be saved as <span className="font-mono text-bolt-elements-textSecondary">{normalized}</span>
        </p>
      ) : null}
      {fetcher.data?.error ? (
        <p className="text-sm text-bolt-elements-icon-error" role="alert">
          {fetcher.data.error}
        </p>
      ) : null}
      {justRenamed ? (
        <p className="text-sm text-bolt-elements-icon-success" role="status">
          URL slug updated. The previous URL will redirect here for 30 days.
        </p>
      ) : null}
      <div>
        <Button type="submit" variant="primary" disabled={!changed || busy} aria-busy={busy}>
          {busy ? 'Saving…' : 'Update slug'}
        </Button>
      </div>
    </fetcher.Form>
  );
}

/*
 * Danger zone — permanently delete the project. Guarded by a type-to-confirm
 * dialog (Radix, focus-trapped) where the user must retype the exact project
 * name; the confirm button stays disabled until it matches. Posts the real
 * `delete-permanent` intent (which forwards the confirmation to the API for a
 * server-side re-check), then returns to the dashboard. No window.confirm.
 */
function DangerZone({ projectId, projectName }: { projectId: string; projectName: string }) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const busy = fetcher.state !== 'idle';
  const canDelete = confirmName === projectName && !busy;

  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data?.ok) {
      navigate('/projects');
    }
  }, [fetcher.state, fetcher.data, navigate]);

  /* Reset the typed confirmation each time the dialog re-opens. */
  useEffect(() => {
    if (open) {
      setConfirmName('');
    }
  }, [open]);

  return (
    <section className="mt-6 grid gap-3 rounded-lg border border-bolt-elements-icon-error/40 bg-bolt-elements-background-depth-2 p-6">
      <div>
        <h2 className="text-sm font-semibold text-bolt-elements-icon-error">Danger zone</h2>
        <p className="mt-1 text-sm text-bolt-elements-textSecondary">
          Permanently delete this project and all of its data. This action cannot be undone.
        </p>
      </div>
      {fetcher.data?.error ? (
        <p className="text-sm text-bolt-elements-icon-error" role="alert">
          {fetcher.data.error}
        </p>
      ) : null}
      <div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-md border border-bolt-elements-icon-error bg-bolt-elements-button-danger-background px-3 py-2 text-sm font-medium text-bolt-elements-button-danger-text hover:bg-bolt-elements-button-danger-backgroundHover"
        >
          Delete this project
        </button>
      </div>

      <RadixDialog.Root open={open} onOpenChange={setOpen}>
        {open ? (
          <Dialog showCloseButton onClose={() => setOpen(false)} onBackdrop={() => setOpen(false)}>
            <div className="p-6">
              <DialogTitle className="text-bolt-elements-icon-error">Delete “{projectName}”?</DialogTitle>
              <DialogDescription className="mb-4">
                This permanently deletes the project and every file, secret and deployment it owns. This cannot be
                undone. Type <strong className="font-mono text-bolt-elements-textPrimary">{projectName}</strong> to
                confirm.
              </DialogDescription>
              <label htmlFor={inputId} className="sr-only">
                Type the project name to confirm deletion
              </label>
              <input
                id={inputId}
                ref={inputRef}
                value={confirmName}
                onChange={(event) => setConfirmName(event.target.value)}
                placeholder={projectName}
                autoComplete="off"
                spellCheck={false}
                className="mb-4 h-10 w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 text-sm outline-none focus:border-bolt-elements-icon-error"
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && canDelete) {
                    event.preventDefault();
                    submitDelete();
                  }
                }}
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" type="button" onClick={() => setOpen(false)} disabled={busy}>
                  Cancel
                </Button>
                <Button variant="destructive" type="button" disabled={!canDelete} onClick={submitDelete}>
                  {busy ? 'Deleting…' : 'Delete project'}
                </Button>
              </div>
            </div>
          </Dialog>
        ) : null}
      </RadixDialog.Root>
    </section>
  );

  function submitDelete() {
    if (!canDelete) {
      return;
    }

    setOpen(false);
    fetcher.submit(
      { intent: 'delete-permanent', confirmName },
      { method: 'post', action: `/api/projects/${projectId}/project-action` },
    );
  }
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
