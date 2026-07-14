import { Braces, Trash2 } from 'lucide-react';
import type { MetaFunction } from 'react-router';
import { Form, Link, useActionData, useLoaderData, useNavigation, useSearchParams } from 'react-router';
import {
  buildEnvVarDiff,
  buildEnvVarRows,
  ENV_VAR_SCOPES,
  ENV_VAR_SCOPE_LABELS,
  normalizeEnvVarScope,
  type EnvVarRecord,
  type EnvVarScope,
} from './projects.$projectId.env.helpers';
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
export { UserAreaRouteErrorBoundary as ErrorBoundary } from '~/components/dashboard/UserAreaRouteError';
export const loader = (args: EnterpriseLoaderArgs) =>
  projectPageLoader<EnvData>(args, (projectId) => `/projects/${projectId}/env-vars`);
export const action = (args: EnterpriseActionArgs) =>
  projectAction(args, {
    default: async ({ request, projectId, body }) => {
      const scope = normalizeEnvVarScope(typeof body.scope === 'string' ? body.scope : undefined);

      try {
        await apiRequest(request, `/projects/${projectId}/env-vars`, {
          method: 'PUT',
          body: JSON.stringify({ key: body.key, value: body.value ?? '', scope }),
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

      return redirect(`/projects/${projectId}/env?scope=${scope}`);
    },
    delete: async ({ request, projectId, body }) => {
      const scope = normalizeEnvVarScope(typeof body.scope === 'string' ? body.scope : undefined);

      try {
        await apiRequest(request, `/projects/${projectId}/env-vars`, {
          method: 'DELETE',
          body: JSON.stringify({ key: body.key, scope }),
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

      return redirect(`/projects/${projectId}/env?scope=${scope}`);
    },
  });

export default function ProjectEnvPage() {
  const { project, data } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const saving = navigation.state === 'submitting';
  const actionData = useActionData<typeof action>() as { error?: string } | undefined;
  const [searchParams] = useSearchParams();

  const activeScope = normalizeEnvVarScope(searchParams.get('scope') ?? undefined);
  const rows = buildEnvVarRows(data.envVars, activeScope);
  const diffRows = buildEnvVarDiff(data.envVars).filter((row) => row.differs);

  const scopeCounts = ENV_VAR_SCOPES.reduce<Record<EnvVarScope, number>>(
    (acc, scope) => {
      acc[scope] = (data.envVars ?? []).filter((item) => normalizeEnvVarScope(item.scope) === scope).length;
      return acc;
    },
    { development: 0, preview: 0, production: 0 },
  );

  return (
    <ProjectShell
      projectId={project.id}
      title="Environment variables"
      description="Manage non-secret runtime configuration per environment. Variables are scoped to Development, Preview or Production."
    >
      {/* Scope tabs — one per environment, active tab drives the list + the add form. */}
      <div
        role="tablist"
        aria-label="Environment scope"
        className="mb-6 inline-flex flex-wrap gap-1 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-1"
      >
        {ENV_VAR_SCOPES.map((scope) => {
          const active = scope === activeScope;
          return (
            <Link
              key={scope}
              to={`?scope=${scope}`}
              preventScrollReset
              role="tab"
              aria-selected={active}
              className={classNames(
                'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                active
                  ? 'bg-bolt-elements-background-depth-1 text-bolt-elements-textPrimary shadow-sm'
                  : 'text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary',
              )}
            >
              {ENV_VAR_SCOPE_LABELS[scope]}
              <span className="rounded-full bg-bolt-elements-background-depth-3 px-1.5 text-xs tabular-nums text-bolt-elements-textSecondary">
                {scopeCounts[scope]}
              </span>
            </Link>
          );
        })}
      </div>

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
                  <input type="hidden" name="scope" value={activeScope} />
                  <button
                    type="submit"
                    disabled={saving}
                    aria-label={`Delete ${row.key} from ${ENV_VAR_SCOPE_LABELS[activeScope]}`}
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
          className="grid h-fit gap-4 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-6"
        >
          <input type="hidden" name="scope" value={activeScope} />
          <p className="text-sm text-bolt-elements-textSecondary">
            Adding to{' '}
            <span className="font-medium text-bolt-elements-textPrimary">{ENV_VAR_SCOPE_LABELS[activeScope]}</span>
          </p>
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

      <EnvDiffSection rows={diffRows} />
    </ProjectShell>
  );
}

/**
 * Cross-environment diff: surfaces only keys whose value is missing or different
 * across Development / Preview / Production, so a drift between environments is
 * visible at a glance. Hidden entirely when every key is consistent.
 */
function EnvDiffSection({ rows }: { rows: ReturnType<typeof buildEnvVarDiff> }) {
  if (rows.length === 0) {
    return null;
  }

  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold">Differences across environments</h2>
      <p className="mt-1 text-sm text-bolt-elements-textSecondary">
        {rows.length} variable{rows.length === 1 ? '' : 's'} differ between Development, Preview and Production.
      </p>
      <div className="mt-4 overflow-x-auto rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-sm">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead>
            <tr className="border-b border-bolt-elements-borderColor text-xs uppercase tracking-wide text-bolt-elements-textSecondary">
              <th className="px-4 py-2.5 font-medium">Variable</th>
              {ENV_VAR_SCOPES.map((scope) => (
                <th key={scope} className="px-4 py-2.5 font-medium">
                  {ENV_VAR_SCOPE_LABELS[scope]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-b border-bolt-elements-borderColor last:border-b-0">
                <td className="px-4 py-2.5 font-mono text-xs font-medium">{row.key}</td>
                {ENV_VAR_SCOPES.map((scope) => {
                  const value = row.values[scope];
                  return (
                    <td key={scope} className="px-4 py-2.5">
                      {value === undefined ? (
                        <span className="text-bolt-elements-textTertiary">— not set</span>
                      ) : (
                        <span
                          className="block max-w-[220px] truncate font-mono text-xs text-bolt-elements-textPrimary"
                          title={value}
                        >
                          {value === '' ? '(empty)' : value}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
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
