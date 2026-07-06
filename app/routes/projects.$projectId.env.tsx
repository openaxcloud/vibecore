import { Braces, Trash2 } from 'lucide-react';
import type { MetaFunction } from 'react-router';
import { Form, useActionData, useLoaderData, useNavigation } from 'react-router';
import { buildEnvVarRows, type EnvVarRecord } from './projects.$projectId.env.helpers';
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
import { classNames } from '~/utils/classNames';

type EnvData = { envVars: EnvVarRecord[] };

export const meta: MetaFunction = () => [{ title: 'Environment variables - E-Code' }];
export const loader = (args: EnterpriseLoaderArgs) =>
  projectPageLoader<EnvData>(args, (projectId) => `/projects/${projectId}/env-vars`);
export const action = (args: EnterpriseActionArgs) =>
  projectAction(args, {
    default: async ({ request, projectId, body }) => {
      try {
        await apiRequest(request, `/projects/${projectId}/env-vars`, {
          method: 'PUT',
          body: JSON.stringify({ key: body.key, value: body.value ?? '' }),
        });
      } catch (error) {
        /*
         * apiRequest throws a react-router redirect() Response (3xx with a Location header) when
         * the session expired (401) or MFA is required (403). Re-throw it so the browser follows
         * the re-auth redirect instead of rendering it as a body-less inline error.
         */
        if (error instanceof Response && error.status >= 300 && error.status < 400) {
          throw error;
        }

        /*
         * The API validates the key against /^[A-Z0-9_]+$/ (400), enforces RBAC (403) and may fail
         * with 500. Surface the message inline instead of throwing to an error boundary.
         */
        const status = error instanceof Response ? error.status : 400;

        return json({ error: await apiErrorMessage(error, 'Failed to save variable') }, { status });
      }
      return redirect(`/projects/${projectId}/env`);
    },
    delete: async ({ request, projectId, body }) => {
      try {
        await apiRequest(request, `/projects/${projectId}/env-vars`, {
          method: 'DELETE',
          body: JSON.stringify({ key: body.key }),
        });
      } catch (error) {
        /*
         * apiRequest throws a react-router redirect() Response (3xx with a Location header) when
         * the session expired (401) or MFA is required (403). Re-throw it so the browser follows
         * the re-auth redirect instead of rendering it as a body-less inline error.
         */
        if (error instanceof Response && error.status >= 300 && error.status < 400) {
          throw error;
        }

        /*
         * The API enforces RBAC (403) and returns 404 when the key no longer
         * exists. Surface the message inline instead of throwing to an error
         * boundary so the panel stays usable.
         */
        const status = error instanceof Response ? error.status : 400;

        return json({ error: await apiErrorMessage(error, 'Failed to delete variable') }, { status });
      }

      return redirect(`/projects/${projectId}/env`);
    },
  });

export default function ProjectEnvPage() {
  const { project, data } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const saving = navigation.state === 'submitting';
  const actionData = useActionData<typeof action>() as { error?: string } | undefined;
  const rows = buildEnvVarRows(data.envVars);

  return (
    <ProjectShell
      projectId={project.id}
      title="Environment variables"
      description="Manage non-secret runtime configuration for development, preview and production environments."
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-sm">
          {rows.map((row, index) => (
            <div
              key={row.kind === 'var' ? row.id : 'empty'}
              className={classNames(
                'flex items-start gap-3 p-4',
                index > 0 && 'border-t border-bolt-elements-borderColor',
              )}
            >
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-bolt-elements-background-depth-3">
                <Braces className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{row.kind === 'var' ? row.key : row.title}</p>
                <p className="mt-1 text-sm text-bolt-elements-textSecondary">{row.detail}</p>
              </div>
              {row.kind === 'var' ? (
                <Form method="post" className="shrink-0">
                  <input type="hidden" name="intent" value="delete" />
                  <input type="hidden" name="key" value={row.key} />
                  <button
                    type="submit"
                    disabled={saving}
                    aria-label={`Delete ${row.key}`}
                    className="rounded-md p-2 text-bolt-elements-textSecondary transition-colors hover:bg-bolt-elements-background-depth-3 hover:text-[var(--status-error-text)] disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </Form>
              ) : null}
            </div>
          ))}
        </div>
        <Form
          method="post"
          className="grid gap-4 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-6"
        >
          <Field
            label="Variable name"
            name="key"
            placeholder="VITE_API_URL"
            pattern="[A-Z0-9_]+"
            title="Use uppercase letters, numbers and underscores only."
            required
          />
          <Field label="Value" name="value" placeholder="https://api.example.com" />
          {actionData?.error ? (
            <p className="text-sm text-[var(--status-error-text)]" role="alert">
              {actionData.error}
            </p>
          ) : null}
          <Button type="submit" disabled={saving} aria-busy={saving}>
            {saving ? 'Saving…' : 'Save variable'}
          </Button>
        </Form>
      </div>
    </ProjectShell>
  );
}

function Field(props: {
  label: string;
  name: string;
  placeholder?: string;
  pattern?: string;
  title?: string;
  required?: boolean;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      <span>
        {props.label}
        {props.required ? (
          <span className="ml-0.5 text-[var(--status-error-text)]" aria-hidden>
            *
          </span>
        ) : null}
      </span>
      <input
        className="h-10 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 text-sm outline-none focus:border-bolt-elements-focus"
        name={props.name}
        placeholder={props.placeholder}
        pattern={props.pattern}
        title={props.title}
        required={props.required}
      />
    </label>
  );
}
