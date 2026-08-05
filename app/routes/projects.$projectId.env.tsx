import { Braces, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { MetaFunction } from 'react-router';
import { Form, Link, useActionData, useLoaderData, useNavigation, useSearchParams } from 'react-router';
import {
  buildEnvVarDiff,
  buildEnvVarRows,
  ENV_VAR_SCOPES,
  normalizeEnvVarScope,
  type EnvVarRecord,
  type EnvVarScope,
} from './projects.$projectId.env.helpers';
import { ProjectShell } from '~/components/dashboard/SaaSLayout';
import { Button } from '~/components/ui/Button';
import {
  apiRequest,
  formObject,
  json,
  redirect,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import {
  formatProjectEnvCopy,
  getProjectEnvCopy,
  getProjectEnvPluralKey,
  getProjectEnvScopeLabel,
  resolveProjectEnvLanguage,
  type ProjectEnvCopy,
} from '~/lib/i18n/catalogs/project-env';
import { resolveRequestLocale } from '~/lib/i18n/request-locale';
import type { ProjectRecord } from '~/lib/project-route.server';
import { isReauthRedirect } from '~/lib/route-reauth';
import { classNames } from '~/utils/classNames';

type EnvData = { envVars: EnvVarRecord[] };

// Code-facing examples remain locale-neutral by design.
const VARIABLE_NAME_PLACEHOLDER = 'VITE_API_URL';

export const meta: MetaFunction<typeof loader> = ({ data, matches }) => {
  const rootData = matches.find((match) => match.id === 'root')?.data as { language?: string } | undefined;
  const copy = getProjectEnvCopy(data?.language ?? rootData?.language);
  const title = copy['projectEnv.meta.title'];
  const description = copy['projectEnv.meta.description'];

  return [
    { title },
    { name: 'description', content: description },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { name: 'twitter:title', content: title },
    { name: 'twitter:description', content: description },
  ];
};
export { UserAreaRouteErrorBoundary as ErrorBoundary } from '~/components/dashboard/UserAreaRouteError';

export async function loader({ request, params }: EnterpriseLoaderArgs) {
  const language = resolveProjectEnvLanguage(resolveRequestLocale(request).language);
  const copy = getProjectEnvCopy(language);
  const projectId = params.projectId;

  if (!projectId) {
    throw json({ error: copy['projectEnv.error.projectNotFound'] }, { status: 404 });
  }

  try {
    const [projectResult, data] = await Promise.all([
      apiRequest<{ project: ProjectRecord }>(request, `/projects/${projectId}`),
      apiRequest<EnvData>(request, `/projects/${projectId}/env-vars`),
    ]);

    return json({ project: projectResult.project, data, language });
  } catch (error) {
    if (isReauthRedirect(error)) {
      throw error;
    }

    console.error('Environment variable loader failed:', error);
    throw json({ error: copy['projectEnv.error.serviceUnavailable'] }, { status: 503 });
  }
}

export async function action({ request, params }: EnterpriseActionArgs) {
  const language = resolveProjectEnvLanguage(resolveRequestLocale(request).language);
  const copy = getProjectEnvCopy(language);
  const projectId = params.projectId;

  if (!projectId) {
    throw json({ error: copy['projectEnv.error.projectNotFound'] }, { status: 404 });
  }

  const body = formObject(await request.formData()) as Record<string, string>;
  const intent = body.intent === 'delete' ? 'delete' : 'save';
  const scope = normalizeEnvVarScope(body.scope);

  try {
    await apiRequest(request, `/projects/${projectId}/env-vars`, {
      method: intent === 'delete' ? 'DELETE' : 'PUT',
      body: JSON.stringify(
        intent === 'delete' ? { key: body.key, scope } : { key: body.key, value: body.value ?? '', scope },
      ),
    });
  } catch (error) {
    if (isReauthRedirect(error)) {
      throw error;
    }

    console.error(`Environment variable ${intent} failed:`, error);

    const status = error instanceof Response ? error.status : 503;

    const errorKey =
      status >= 500
        ? 'projectEnv.error.serviceUnavailable'
        : intent === 'delete'
          ? 'projectEnv.error.deleteFailed'
          : 'projectEnv.error.saveFailed';

    return json({ error: copy[errorKey] }, { status });
  }

  return redirect(`/projects/${projectId}/env?scope=${scope}`);
}

export default function ProjectEnvPage() {
  const { i18n } = useTranslation();
  const { project, data, language: loadedLanguage } = useLoaderData<typeof loader>();
  const language = resolveProjectEnvLanguage(i18n.resolvedLanguage ?? i18n.language ?? loadedLanguage);
  const copy = getProjectEnvCopy(language);
  const navigation = useNavigation();
  const saving = navigation.state === 'submitting';
  const actionData = useActionData<typeof action>() as { error?: string } | undefined;
  const [searchParams] = useSearchParams();

  const activeScope = normalizeEnvVarScope(searchParams.get('scope') ?? undefined);
  const rows = buildEnvVarRows(data.envVars, activeScope, language, copy);
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
      title={copy['projectEnv.page.title']}
      description={copy['projectEnv.page.description']}
    >
      {/* Scope tabs — one per environment, active tab drives the list + the add form. */}
      <div
        role="tablist"
        aria-label={copy['projectEnv.scope.ariaLabel']}
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
                'inline-flex min-h-11 items-center gap-2 whitespace-normal rounded-md px-3 py-2 text-left text-sm font-medium transition-colors',
                active
                  ? 'bg-bolt-elements-background-depth-1 text-bolt-elements-textPrimary shadow-sm'
                  : 'text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary',
              )}
            >
              {getProjectEnvScopeLabel(scope, copy)}
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
                    aria-label={formatProjectEnvCopy(copy['projectEnv.delete.ariaLabel'], {
                      key: row.key,
                      scope: getProjectEnvScopeLabel(activeScope, copy),
                    })}
                    className="min-h-11 min-w-11 rounded-md p-2 text-bolt-elements-textSecondary transition-colors hover:bg-bolt-elements-background-depth-3 hover:text-[var(--status-error-text)] disabled:opacity-50"
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
            {formatProjectEnvCopy(copy['projectEnv.form.addingTo'], {
              scope: getProjectEnvScopeLabel(activeScope, copy),
            })}
          </p>
          <Field
            label={copy['projectEnv.form.name']}
            name="key"
            placeholder={VARIABLE_NAME_PLACEHOLDER}
            pattern="[A-Z0-9_]+"
            title={copy['projectEnv.form.nameHelp']}
            required
          />
          <Field label={copy['projectEnv.form.value']} name="value" placeholder="https://api.example.com" />
          {actionData?.error ? (
            <p className="text-sm text-[var(--status-error-text)]" role="alert">
              {actionData.error}
            </p>
          ) : null}
          <Button type="submit" disabled={saving} aria-busy={saving}>
            {saving ? copy['projectEnv.form.saving'] : copy['projectEnv.form.submit']}
          </Button>
        </Form>
      </div>

      <EnvDiffSection rows={diffRows} copy={copy} language={language} />
    </ProjectShell>
  );
}

/**
 * Cross-environment diff: surfaces only keys whose value is missing or different
 * across Development / Preview / Production, so a drift between environments is
 * visible at a glance. Hidden entirely when every key is consistent.
 */
export function EnvDiffSection({
  rows,
  copy,
  language,
}: {
  rows: ReturnType<typeof buildEnvVarDiff>;
  copy: ProjectEnvCopy;
  language: string;
}) {
  if (rows.length === 0) {
    return null;
  }

  return (
    <section className="mt-8">
      <h2 className="break-words text-sm font-semibold">{copy['projectEnv.diff.title']}</h2>
      <p className="mt-1 text-sm text-bolt-elements-textSecondary">
        {formatProjectEnvCopy(copy[getProjectEnvPluralKey('projectEnv.diff.summary', rows.length, language)], {
          count: rows.length,
        })}
      </p>
      <div className="mt-4 overflow-x-auto rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-sm">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead>
            <tr className="border-b border-bolt-elements-borderColor text-xs uppercase tracking-wide text-bolt-elements-textSecondary">
              <th className="px-4 py-2.5 font-medium">{copy['projectEnv.diff.variable']}</th>
              {ENV_VAR_SCOPES.map((scope) => (
                <th key={scope} className="px-4 py-2.5 font-medium">
                  {getProjectEnvScopeLabel(scope, copy)}
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
                        <span className="text-bolt-elements-textTertiary">{copy['projectEnv.diff.notSet']}</span>
                      ) : (
                        <span
                          data-user-content
                          className="block max-w-[220px] truncate font-mono text-xs text-bolt-elements-textPrimary"
                          title={value}
                        >
                          {value === '' ? copy['projectEnv.diff.empty'] : value}
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
        className="h-11 min-w-0 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 text-sm outline-none focus:border-bolt-elements-focus"
        name={props.name}
        placeholder={props.placeholder}
        pattern={props.pattern}
        title={props.title}
        required={props.required}
      />
    </label>
  );
}
