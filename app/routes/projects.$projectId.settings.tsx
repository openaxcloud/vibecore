import * as RadixDialog from '@radix-ui/react-dialog';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MetaFunction } from 'react-router';
import { Form, useActionData, useFetcher, useLoaderData, useNavigate, useNavigation } from 'react-router';
import { ProjectShell } from '~/components/dashboard/SaaSLayout';
import { Button } from '~/components/ui/Button';
import { Dialog, DialogDescription, DialogTitle } from '~/components/ui/Dialog';
import {
  apiRequest,
  json,
  redirect,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import {
  formatProjectSettingsCopy,
  getProjectSettingsCopy,
  type ProjectSettingsCopy,
} from '~/lib/i18n/catalogs/project-settings';
import { resolveRequestLocale } from '~/lib/i18n/request-locale';
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

export const meta: MetaFunction = ({ matches }) => {
  const rootData = matches.find((match) => match.id === 'root')?.data as { language?: string } | undefined;

  return [{ title: getProjectSettingsCopy(rootData?.language)['projectSettings.metaTitle'] }];
};
export { UserAreaRouteErrorBoundary as ErrorBoundary } from '~/components/dashboard/UserAreaRouteError';
export const loader = (args: EnterpriseLoaderArgs) =>
  projectPageLoader<SettingsData>(args, (projectId) => `/projects/${projectId}/settings`);
export const action = (args: EnterpriseActionArgs) => {
  const copy = getProjectSettingsCopy(resolveRequestLocale(args.request).language);

  return projectAction(args, {
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

        return json({ error: copy['projectSettings.errors.save'] }, { status });
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

        return json(
          {
            ok: false,
            error: status === 409 ? copy['projectSettings.errors.slugTaken'] : copy['projectSettings.errors.rename'],
          },
          { status },
        );
      }
    },
  });
};

export default function ProjectSettingsPage() {
  const { i18n } = useTranslation();
  const copy = getProjectSettingsCopy(i18n.resolvedLanguage ?? i18n.language);
  const { project } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as { error?: string } | undefined;
  const saving = useNavigation().state === 'submitting';

  return (
    <ProjectShell
      projectId={project.id}
      title={copy['projectSettings.title']}
      description={copy['projectSettings.description']}
    >
      <Form
        method="post"
        className="grid gap-4 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 sm:p-6"
      >
        {actionData?.error ? (
          <p
            className="rounded-md border border-bolt-elements-icon-error bg-bolt-elements-background-depth-1 px-3 py-2 text-sm text-bolt-elements-icon-error"
            role="alert"
          >
            {actionData.error}
          </p>
        ) : null}
        <Field label={copy['projectSettings.fields.name']} name="name" defaultValue={project.name} required />
        <Field
          label={copy['projectSettings.fields.description']}
          name="description"
          defaultValue={project.description ?? ''}
        />
        <Field
          label={copy['projectSettings.fields.repositoryUrl']}
          name="gitRepositoryUrl"
          defaultValue={project.gitRepositoryUrl ?? ''}
        />
        <Field
          label={copy['projectSettings.fields.defaultBranch']}
          name="gitDefaultBranch"
          defaultValue={project.gitDefaultBranch ?? 'main'}
        />
        <div>
          <Button type="submit" variant="primary" disabled={saving} aria-busy={saving}>
            {saving ? copy['projectSettings.actions.saving'] : copy['projectSettings.actions.save']}
          </Button>
        </div>
      </Form>

      <SlugCard slug={project.slug ?? ''} copy={copy} />

      <DangerZone projectId={project.id} projectName={project.name} copy={copy} />
    </ProjectShell>
  );
}

/*
 * Slug rename card (F13). Renaming persists a 30-day redirect from the old
 * canonical URL to the new one, so existing links keep working during the
 * transition. Uses a fetcher so validation/success stays local to this card.
 */
function SlugCard({ slug, copy }: { slug: string; copy: ProjectSettingsCopy }) {
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
      className="mt-6 grid gap-3 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 sm:p-6"
    >
      <input type="hidden" name="intent" value="rename-slug" />
      <div>
        <h2 className="break-words text-sm font-semibold text-bolt-elements-textPrimary">
          {copy['projectSettings.slug.title']}
        </h2>
        <p className="mt-1 text-sm text-bolt-elements-textSecondary">{copy['projectSettings.slug.description']}</p>
      </div>
      <label htmlFor={inputId} className="grid gap-2 text-sm font-medium">
        {copy['projectSettings.slug.label']}
        <input
          id={inputId}
          name="slug"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          spellCheck={false}
          autoCapitalize="none"
          placeholder={copy['projectSettings.slug.placeholder']}
          className="h-10 max-w-md rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 font-mono text-sm outline-none focus:border-[var(--vc-ide-accent-action)]"
        />
      </label>
      {normalized && normalized !== value ? (
        <p className="text-xs text-bolt-elements-textTertiary">
          {copy['projectSettings.slug.normalized']}{' '}
          <span className="break-all font-mono text-bolt-elements-textSecondary">{normalized}</span>
        </p>
      ) : null}
      {fetcher.data?.error ? (
        <p className="text-sm text-bolt-elements-icon-error" role="alert">
          {fetcher.data.error}
        </p>
      ) : null}
      {justRenamed ? (
        <p className="text-sm text-bolt-elements-icon-success" role="status">
          {copy['projectSettings.slug.updated']}
        </p>
      ) : null}
      <div>
        <Button type="submit" variant="primary" disabled={!changed || busy} aria-busy={busy}>
          {busy ? copy['projectSettings.actions.saving'] : copy['projectSettings.slug.update']}
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
function DangerZone({
  projectId,
  projectName,
  copy,
}: {
  projectId: string;
  projectName: string;
  copy: ProjectSettingsCopy;
}) {
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
    <section className="mt-6 grid gap-3 rounded-lg border border-bolt-elements-icon-error/40 bg-bolt-elements-background-depth-2 p-4 sm:p-6">
      <div>
        <h2 className="break-words text-sm font-semibold text-bolt-elements-icon-error">
          {copy['projectSettings.danger.title']}
        </h2>
        <p className="mt-1 text-sm text-bolt-elements-textSecondary">{copy['projectSettings.danger.description']}</p>
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
          {copy['projectSettings.danger.open']}
        </button>
      </div>

      <RadixDialog.Root open={open} onOpenChange={setOpen}>
        {open ? (
          <Dialog showCloseButton onClose={() => setOpen(false)} onBackdrop={() => setOpen(false)}>
            <div className="p-6">
              <DialogTitle className="break-words text-bolt-elements-icon-error">
                {formatProjectSettingsCopy(copy['projectSettings.danger.dialogTitle'], { project: projectName })}
              </DialogTitle>
              <DialogDescription className="mb-4">
                {copy['projectSettings.danger.dialogDescription']} {copy['projectSettings.danger.confirmPrefix']}{' '}
                <strong className="break-all font-mono text-bolt-elements-textPrimary">{projectName}</strong>{' '}
                {copy['projectSettings.danger.confirmSuffix']}
              </DialogDescription>
              <label htmlFor={inputId} className="sr-only">
                {copy['projectSettings.danger.confirmLabel']}
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
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button variant="outline" type="button" onClick={() => setOpen(false)} disabled={busy}>
                  {copy['projectSettings.danger.cancel']}
                </Button>
                <Button variant="destructive" type="button" disabled={!canDelete} onClick={submitDelete}>
                  {busy ? copy['projectSettings.danger.deleting'] : copy['projectSettings.danger.delete']}
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
