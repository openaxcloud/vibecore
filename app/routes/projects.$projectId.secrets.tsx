import { Copy, KeyRound, Lock, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { MetaFunction } from 'react-router';
import { Form, useActionData, useLoaderData, useNavigation } from 'react-router';
import { toast } from 'react-toastify';
import { secretRows, type SecretRecord } from './projects.$projectId.secrets.rows';
import { ProjectShell } from '~/components/dashboard/SaaSLayout';
import { Button } from '~/components/ui/Button';
import { RevealButton } from '~/components/ui/RevealButton';
import {
  apiErrorMessage,
  apiRequest,
  json,
  redirect,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import { projectAction, projectPageLoader } from '~/lib/project-route.server';

type SecretsData = { secrets: SecretRecord[] };

export const meta: MetaFunction = () => [{ title: 'Project secrets - E-Code' }];
export { UserAreaRouteErrorBoundary as ErrorBoundary } from '~/components/dashboard/UserAreaRouteError';
export const loader = (args: EnterpriseLoaderArgs) =>
  projectPageLoader<SecretsData>(args, (projectId) => `/projects/${projectId}/secrets`);
export const action = (args: EnterpriseActionArgs) =>
  projectAction(args, {
    default: async ({ request, projectId, body }) => {
      try {
        await apiRequest(request, `/projects/${projectId}/secrets`, {
          method: 'PUT',
          body: JSON.stringify({ key: body.key, value: body.value ?? '' }),
        });
      } catch (error) {
        /*
         * The API validates the key against /^[A-Z0-9_]+$/ (400), enforces RBAC (403) and may fail
         * with 500. Surface the message inline instead of throwing to an error boundary.
         * `apiRequest` may throw a redirect Response (e.g. to /login on 401/MFA-403); let those
         * propagate so the sign-in redirect actually happens instead of becoming a broken 3xx json().
         */
        if (error instanceof Response && error.status >= 300 && error.status < 400) {
          throw error;
        }

        const status = error instanceof Response ? error.status : 400;

        return json({ error: await apiErrorMessage(error, 'Failed to save secret') }, { status });
      }

      return redirect(`/projects/${projectId}/secrets`);
    },
    delete: async ({ request, projectId, body }) => {
      try {
        await apiRequest(request, `/projects/${projectId}/secrets`, {
          method: 'DELETE',
          body: JSON.stringify({ key: body.key }),
        });
      } catch (error) {
        /*
         * Mirror the upsert path: surface RBAC/not-found/server errors inline instead of an error
         * boundary, but let redirect Responses (401/MFA-403 re-auth) propagate so the user is
         * actually sent to sign in rather than seeing a broken inline error.
         */
        if (error instanceof Response && error.status >= 300 && error.status < 400) {
          throw error;
        }

        const status = error instanceof Response ? error.status : 400;

        return json({ error: await apiErrorMessage(error, 'Failed to delete secret') }, { status });
      }

      return redirect(`/projects/${projectId}/secrets`);
    },
  });

export default function ProjectSecretsPage() {
  const { project, data } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const saving = navigation.state === 'submitting';
  const actionData = useActionData<typeof action>() as { error?: string } | undefined;
  const rows = secretRows(data.secrets);

  const copyKey = (key: string) => {
    void navigator.clipboard
      .writeText(key)
      .then(() => toast.success('Copied'))
      .catch(() => toast.error('Could not copy to clipboard'));
  };

  return (
    <ProjectShell
      projectId={project.id}
      title="Secrets"
      description="Encrypted project secrets with explicit runtime injection and no plain-text logs."
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-sm">
          {rows.map((row, index) =>
            row.kind === 'secret' ? (
              <div
                key={row.key}
                className={
                  index > 0
                    ? 'flex items-center gap-3 border-t border-bolt-elements-borderColor p-4'
                    : 'flex items-center gap-3 p-4'
                }
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-bolt-elements-background-depth-3">
                  <Lock className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{row.key}</p>
                  <p className="mt-1 text-sm text-bolt-elements-textSecondary">{row.detail}</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => copyKey(row.key)}
                  aria-label={`Copy secret name ${row.key}`}
                  title={`Copy secret name ${row.key}`}
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
                    aria-label={`Delete secret ${row.key}`}
                    title={`Delete secret ${row.key}`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                </Form>
              </div>
            ) : (
              <div key="empty" className="flex gap-3 p-4">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-bolt-elements-background-depth-3">
                  <KeyRound className="h-4 w-4" aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-medium">{row.title}</p>
                  <p className="mt-1 text-sm text-bolt-elements-textSecondary">{row.detail}</p>
                </div>
              </div>
            ),
          )}
        </div>
        <Form
          method="post"
          className="grid gap-4 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-6"
        >
          <Field
            label="Secret name"
            name="key"
            placeholder="STRIPE_SECRET_KEY"
            pattern="[A-Z0-9_]+"
            title="Use uppercase letters, numbers and underscores only."
            required
          />
          <SecretValueField />
          {actionData?.error ? (
            <p className="text-sm text-[var(--status-error-text)]" role="alert">
              {actionData.error}
            </p>
          ) : null}
          <Button type="submit" disabled={saving} aria-busy={saving}>
            {saving ? 'Saving…' : 'Save secret'}
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
function SecretValueField() {
  const [value, setValue] = useState('');
  const [revealed, setRevealed] = useState(false);

  return (
    <label className="grid gap-2 text-sm font-medium">
      <span>
        Secret value
        <span className="ml-0.5 text-[var(--status-error-text)]" aria-hidden>
          *
        </span>
      </span>
      <div className="relative">
        <input
          className="h-10 w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 pl-3 pr-11 text-sm outline-none focus:border-bolt-elements-focus"
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
          aria-label="Secret value"
        />
        <RevealButton
          revealed={revealed}
          onToggle={() => setRevealed((current) => !current)}
          subject="secret value"
          className="absolute right-1 top-1/2 -translate-y-1/2"
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
        className="h-10 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 text-sm outline-none focus:border-bolt-elements-focus"
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
