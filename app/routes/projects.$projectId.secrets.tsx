import { Copy, KeyRound, Lock, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MetaFunction } from 'react-router';
import { Form, useActionData, useLoaderData, useNavigation } from 'react-router';
import { toast } from 'react-toastify';
import { secretRows, type SecretRecord } from './projects.$projectId.secrets.rows';
import { ProjectShell } from '~/components/dashboard/SaaSLayout';
import { Button } from '~/components/ui/Button';
import { RevealButton } from '~/components/ui/RevealButton';
import {
  apiRequest,
  formObject,
  json,
  redirect,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import {
  formatProjectSecretsCopy,
  getProjectSecretsCopy,
  resolveProjectSecretsLanguage,
  type ProjectSecretsCopy,
} from '~/lib/i18n/catalogs/project-secrets';
import { localeResponseHeaders, resolveRequestLocale } from '~/lib/i18n/request-locale';
import type { ProjectRecord } from '~/lib/project-route.server';
import { isReauthRedirect } from '~/lib/route-reauth';

type SecretsData = { secrets: SecretRecord[] };

const SECRET_NAME_PLACEHOLDER = 'STRIPE_SECRET_KEY';

export const meta: MetaFunction<typeof loader> = ({ data, matches }) => {
  const rootData = matches.find((match) => match.id === 'root')?.data as { language?: string } | undefined;
  const copy = getProjectSecretsCopy(data?.language ?? rootData?.language);
  const title = copy['projectSecrets.meta.title'];
  const description = copy['projectSecrets.meta.description'];

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
  const localeResolution = resolveRequestLocale(request);
  const language = resolveProjectSecretsLanguage(localeResolution.language);
  const copy = getProjectSecretsCopy(language);
  const projectId = params.projectId;

  if (!projectId) {
    throw json({ error: copy['projectSecrets.error.projectNotFound'] }, { status: 404 });
  }

  try {
    const [projectResult, data] = await Promise.all([
      apiRequest<{ project: ProjectRecord }>(request, `/projects/${projectId}`),
      apiRequest<SecretsData>(request, `/projects/${projectId}/secrets`),
    ]);

    return json(
      { project: projectResult.project, data, language },
      { headers: localeResponseHeaders(request, localeResolution) },
    );
  } catch (error) {
    if (isReauthRedirect(error)) {
      throw error;
    }

    console.error('Project secrets loader failed:', error);
    throw json({ error: copy['projectSecrets.error.serviceUnavailable'] }, { status: 503 });
  }
}

export async function action({ request, params }: EnterpriseActionArgs) {
  const language = resolveProjectSecretsLanguage(resolveRequestLocale(request).language);
  const copy = getProjectSecretsCopy(language);
  const projectId = params.projectId;

  if (!projectId) {
    throw json({ error: copy['projectSecrets.error.projectNotFound'] }, { status: 404 });
  }

  const body = formObject(await request.formData()) as Record<string, string>;
  const intent = body.intent === 'delete' ? 'delete' : 'save';

  try {
    await apiRequest(request, `/projects/${projectId}/secrets`, {
      method: intent === 'delete' ? 'DELETE' : 'PUT',
      body: JSON.stringify(intent === 'delete' ? { key: body.key } : { key: body.key, value: body.value ?? '' }),
    });
  } catch (error) {
    if (isReauthRedirect(error)) {
      throw error;
    }

    console.error(`Project secret ${intent} failed:`, error);

    const status = error instanceof Response ? error.status : 503;

    return json(
      {
        error: copy[intent === 'delete' ? 'projectSecrets.error.deleteFailed' : 'projectSecrets.error.saveFailed'],
      },
      { status },
    );
  }

  return redirect(`/projects/${projectId}/secrets`);
}

export default function ProjectSecretsPage() {
  const { i18n } = useTranslation();
  const { project, data, language: loadedLanguage } = useLoaderData<typeof loader>();
  const language = resolveProjectSecretsLanguage(i18n.resolvedLanguage ?? i18n.language ?? loadedLanguage);
  const copy = getProjectSecretsCopy(language);
  const navigation = useNavigation();
  const saving = navigation.state === 'submitting';
  const actionData = useActionData<typeof action>() as { error?: string } | undefined;
  const rows = secretRows(data.secrets, language, copy);

  const copyKey = (key: string) => {
    void navigator.clipboard
      .writeText(key)
      .then(() => toast.success(copy['projectSecrets.copy.success']))
      .catch(() => toast.error(copy['projectSecrets.copy.failed']));
  };

  return (
    <ProjectShell
      projectId={project.id}
      title={copy['projectSecrets.page.title']}
      description={copy['projectSecrets.page.description']}
    >
      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,380px)]">
        <div className="min-w-0 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-sm">
          {rows.map((row, index) =>
            row.kind === 'secret' ? (
              <div
                key={row.key}
                className={
                  index > 0
                    ? 'flex min-w-0 flex-wrap items-center gap-3 border-t border-bolt-elements-borderColor p-4'
                    : 'flex min-w-0 flex-wrap items-center gap-3 p-4'
                }
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-bolt-elements-background-depth-3">
                  <Lock className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="break-all text-sm font-medium">{row.key}</p>
                  <p className="mt-1 break-words text-sm text-bolt-elements-textSecondary [overflow-wrap:anywhere]">
                    {row.detail}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => copyKey(row.key)}
                  aria-label={formatProjectSecretsCopy(copy['projectSecrets.copy.ariaLabel'], { key: row.key })}
                  title={formatProjectSecretsCopy(copy['projectSecrets.copy.ariaLabel'], { key: row.key })}
                  className="!h-11 !w-11 shrink-0"
                >
                  <Copy className="h-4 w-4" aria-hidden />
                </Button>
                <Form method="post">
                  <input type="hidden" name="intent" value="delete" />
                  <input type="hidden" name="key" value={row.key} />
                  <Button
                    type="submit"
                    variant="outline"
                    size="sm"
                    disabled={saving}
                    aria-label={formatProjectSecretsCopy(copy['projectSecrets.delete.ariaLabel'], { key: row.key })}
                    title={formatProjectSecretsCopy(copy['projectSecrets.delete.ariaLabel'], { key: row.key })}
                    className="!h-11 !w-11 shrink-0"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                </Form>
              </div>
            ) : (
              <div key="empty" className="flex min-w-0 gap-3 p-4">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-bolt-elements-background-depth-3">
                  <KeyRound className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="break-words text-sm font-medium [overflow-wrap:anywhere]">{row.title}</p>
                  <p className="mt-1 break-words text-sm text-bolt-elements-textSecondary [overflow-wrap:anywhere]">
                    {row.detail}
                  </p>
                </div>
              </div>
            ),
          )}
        </div>
        <Form
          method="post"
          className="grid h-fit min-w-0 gap-4 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 sm:p-6"
        >
          <Field
            label={copy['projectSecrets.form.name']}
            name="key"
            placeholder={SECRET_NAME_PLACEHOLDER}
            pattern="[A-Z0-9_]+"
            title={copy['projectSecrets.form.nameHelp']}
            required
          />
          <SecretValueField copy={copy} />
          {actionData?.error ? (
            <p className="text-sm text-[var(--status-error-text)]" role="alert">
              {actionData.error}
            </p>
          ) : null}
          <Button type="submit" disabled={saving} aria-busy={saving}>
            {saving ? copy['projectSecrets.form.saving'] : copy['projectSecrets.form.submit']}
          </Button>
        </Form>
      </div>
    </ProjectShell>
  );
}

/*
 * Secret value input: monospaced so opaque tokens are legible, reveal toggle so
 * the value can be visually verified before saving, and paste is trimmed so a
 * stray trailing newline/space copied from a dashboard never poisons the secret.
 * Controlled locally; the value is still submitted via the `value` form field.
 */
function SecretValueField({ copy }: { copy: ProjectSecretsCopy }) {
  const [value, setValue] = useState('');
  const [revealed, setRevealed] = useState(false);

  return (
    <label className="grid gap-2 text-sm font-medium">
      <span>
        {copy['projectSecrets.form.value']}
        <span className="ml-0.5 text-[var(--status-error-text)]" aria-hidden>
          *
        </span>
      </span>
      <div className="relative">
        <input
          className="min-h-11 w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 py-2 pl-3 pr-12 text-sm outline-none focus:border-bolt-elements-focus"
          style={{ fontFamily: 'var(--vc-font-code)' }}
          name="value"
          type={revealed ? 'text' : 'password'}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onPaste={(event) => {
            event.preventDefault();

            const pasted = event.clipboardData.getData('text').trim();
            const input = event.currentTarget;
            const start = input.selectionStart ?? value.length;
            const end = input.selectionEnd ?? value.length;
            setValue((current) => current.slice(0, start) + pasted + current.slice(end));
          }}
          autoComplete="off"
          spellCheck={false}
          required
          aria-label={copy['projectSecrets.form.value']}
        />
        <RevealButton
          revealed={revealed}
          onToggle={() => setRevealed((current) => !current)}
          subject={copy['projectSecrets.form.revealSubject']}
          className="absolute right-0 top-1/2 !h-11 !w-11 -translate-y-1/2"
        />
      </div>
    </label>
  );
}

function Field(props: {
  label: string;
  name: string;
  type?: string;
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
        className="min-h-11 min-w-0 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm outline-none focus:border-bolt-elements-focus"
        name={props.name}
        type={props.type ?? 'text'}
        placeholder={props.placeholder}
        pattern={props.pattern}
        title={props.title}
        required={props.required}
      />
    </label>
  );
}
