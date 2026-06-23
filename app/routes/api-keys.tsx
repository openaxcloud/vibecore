import { KeyRound, Trash2 } from 'lucide-react';
import type { MetaFunction } from 'react-router';
import { data as json } from 'react-router';
import { Form, useActionData, useLoaderData, useNavigation } from 'react-router';
import { AppShell, StatusPill } from '~/components/dashboard/SaaSLayout';
import { Button } from '~/components/ui/Button';
import { apiRequest, type EnterpriseActionArgs, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';
import { shouldRethrowActionError } from '~/lib/route-reauth';
import { classNames } from '~/utils/classNames';

export const meta: MetaFunction = () => [{ title: 'API keys - E-Code' }];

type ApiKeyScope = 'read' | 'write' | 'admin';

type ApiKey = {
  id: string;
  name: string;
  keyPrefix: string | null;
  scopes: ApiKeyScope[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
};

const SCOPE_OPTIONS: { value: ApiKeyScope; label: string; detail: string }[] = [
  { value: 'read', label: 'Read', detail: 'List and fetch resources (safe, read-only requests).' },
  { value: 'write', label: 'Write', detail: 'Create, update and delete resources.' },
  { value: 'admin', label: 'Admin', detail: 'Full access, including minting and revoking other keys.' },
];

const EXPIRY_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Never expires' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: '365', label: '1 year' },
];

export async function loader({ request }: EnterpriseLoaderArgs) {
  const data = await apiRequest<{ keys: ApiKey[] }>(request, '/api/keys');

  return { keys: data.keys };
}

type ActionResult =
  | { ok: true; intent: 'create'; token: string; key: ApiKey }
  | { ok: true; intent: 'revoke'; id: string }
  | { ok: false; error: string };

export async function action({ request }: EnterpriseActionArgs) {
  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');

  try {
    if (intent === 'revoke') {
      const id = String(form.get('keyId') ?? '');

      if (!id) {
        return json<ActionResult>({ ok: false, error: 'Missing key id.' }, { status: 400 });
      }

      await apiRequest(request, `/api/keys/${encodeURIComponent(id)}`, { method: 'DELETE' });

      return json<ActionResult>({ ok: true, intent: 'revoke', id });
    }

    if (intent === 'create') {
      const name = String(form.get('name') ?? '').trim();
      const scopes = SCOPE_OPTIONS.map((option) => option.value).filter((scope) => form.get(`scope.${scope}`) === 'on');
      const expiresInDaysRaw = String(form.get('expiresInDays') ?? '').trim();
      const expiresInDays = expiresInDaysRaw ? Number(expiresInDaysRaw) : undefined;

      if (!name) {
        return json<ActionResult>({ ok: false, error: 'Give the key a name.' }, { status: 400 });
      }

      if (scopes.length === 0) {
        return json<ActionResult>({ ok: false, error: 'Select at least one scope.' }, { status: 400 });
      }

      const created = await apiRequest<{ key: ApiKey & { token: string } }>(request, '/api/keys', {
        method: 'POST',
        body: JSON.stringify({ name, scopes, expiresInDays }),
      });

      const { token, ...key } = created.key;

      return json<ActionResult>({ ok: true, intent: 'create', token, key });
    }

    return json<ActionResult>({ ok: false, error: 'Unknown action.' }, { status: 400 });
  } catch (error) {
    /*
     * apiRequest throws a 3xx redirect Response when the session expired mid-flight
     * (login redirect on 401) or MFA is required (redirect to /mfa-setup on 403),
     * and a 5xx Response on server failures. Both must be re-thrown so the framework
     * performs the redirect / the error boundary handles it — never swallowed into a
     * dead-end inline 'Request failed.' message that leaves the form stuck.
     */
    if (shouldRethrowActionError(error)) {
      throw error;
    }

    // apiRequest throws a json() Response on 4xx API errors; surface its message inline.
    if (error instanceof Response) {
      const payload = (await error.json().catch(() => null)) as { error?: string } | null;

      return json<ActionResult>({ ok: false, error: payload?.error ?? 'Request failed.' }, { status: error.status });
    }

    return json<ActionResult>({ ok: false, error: 'Request failed.' }, { status: 500 });
  }
}

const dateFormat: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' };

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString(undefined, dateFormat) : null;
}

export default function ApiKeysPage() {
  const { keys } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as ActionResult | undefined;
  const navigation = useNavigation();
  const busy = navigation.state !== 'idle';

  const createdToken = actionData?.ok && actionData.intent === 'create' ? actionData.token : null;
  const error = actionData && !actionData.ok ? actionData.error : null;

  return (
    <AppShell title="API keys" description="Create, scope, rotate and revoke API keys for automation.">
      <div className="space-y-6">
        {createdToken ? (
          <div role="status" aria-live="polite" className="rounded-lg border border-green-500/40 bg-green-500/5 p-4">
            <p className="text-sm font-semibold text-bolt-elements-textPrimary">Key created — copy it now</p>
            <p className="mt-1 text-sm text-bolt-elements-textSecondary">
              This is the only time the full key is shown. Store it securely; you won&apos;t be able to see it again.
            </p>
            <code className="mt-3 block overflow-x-auto rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-3 px-3 py-2 font-mono text-sm text-bolt-elements-textPrimary">
              {createdToken}
            </code>
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="rounded-md border border-red-500/40 bg-red-500/5 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        ) : null}

        <section className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-5 shadow-sm sm:p-6">
          <h2 className="text-base font-semibold text-bolt-elements-textPrimary">Create a key</h2>
          <p className="mt-1 text-sm text-bolt-elements-textSecondary">
            Scoped, least-privilege tokens authenticate as you for programmatic access.
          </p>

          <Form method="post" className="mt-4 space-y-5">
            <input type="hidden" name="intent" value="create" />

            <div>
              <label htmlFor="name" className="block text-sm font-medium text-bolt-elements-textPrimary">
                Name
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                maxLength={120}
                placeholder="CI deploy bot"
                className="mt-1 w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm text-bolt-elements-textPrimary focus:border-bolt-elements-focus focus:outline-none"
              />
            </div>

            <fieldset>
              <legend className="text-sm font-medium text-bolt-elements-textPrimary">Scopes</legend>
              <div className="mt-2 space-y-2">
                {SCOPE_OPTIONS.map((option) => (
                  <label key={option.value} className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      name={`scope.${option.value}`}
                      defaultChecked={option.value === 'read'}
                      className="mt-0.5 h-4 w-4 rounded border-bolt-elements-borderColor"
                    />
                    <span>
                      <span className="text-sm font-medium text-bolt-elements-textPrimary">{option.label}</span>
                      <span className="block text-xs text-bolt-elements-textTertiary">{option.detail}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div>
              <label htmlFor="expiresInDays" className="block text-sm font-medium text-bolt-elements-textPrimary">
                Expiration
              </label>
              <select
                id="expiresInDays"
                name="expiresInDays"
                defaultValue="90"
                className="mt-1 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm text-bolt-elements-textPrimary focus:border-bolt-elements-focus focus:outline-none"
              >
                {EXPIRY_OPTIONS.map((option) => (
                  <option key={option.label} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <Button type="submit" disabled={busy} aria-busy={busy}>
              {busy ? 'Creating…' : 'Create key'}
            </Button>
          </Form>
        </section>

        <section className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-sm">
          <div className="flex items-center justify-between border-b border-bolt-elements-borderColor p-5 sm:p-6">
            <h2 className="text-base font-semibold text-bolt-elements-textPrimary">Active keys</h2>
            <StatusPill label={`${keys.length} key${keys.length === 1 ? '' : 's'}`} />
          </div>

          {keys.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-bolt-elements-background-depth-3">
                <KeyRound className="h-5 w-5 text-bolt-elements-textTertiary" aria-hidden />
              </span>
              <p className="text-sm text-bolt-elements-textSecondary">No API keys yet. Create one above.</p>
            </div>
          ) : (
            <ul>
              {keys.map((key, index) => {
                const lastUsed = formatDate(key.lastUsedAt);
                const expires = formatDate(key.expiresAt);

                return (
                  <li
                    key={key.id}
                    className={classNames(
                      'flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5',
                      index > 0 && 'border-t border-bolt-elements-borderColor',
                    )}
                  >
                    <div className="min-w-0">
                      <p className="break-words text-sm font-medium text-bolt-elements-textPrimary" title={key.name}>
                        {key.name}
                      </p>
                      <p className="mt-1 font-mono text-xs text-bolt-elements-textTertiary">
                        {key.keyPrefix ? `${key.keyPrefix}…` : 'vck_…'}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {key.scopes.map((scope) => (
                          <span
                            key={scope}
                            className="rounded-full border border-bolt-elements-borderColor px-2 py-0.5 text-xs text-bolt-elements-textSecondary"
                          >
                            {scope}
                          </span>
                        ))}
                      </div>
                      <p className="mt-2 text-xs text-bolt-elements-textTertiary">
                        {lastUsed ? `Last used ${lastUsed}` : 'Never used'}
                        {expires ? ` · Expires ${expires}` : ' · Never expires'}
                      </p>
                    </div>
                    <Form
                      method="post"
                      className="sm:shrink-0"
                      onSubmit={(e) => {
                        if (
                          !window.confirm(
                            `Revoke key "${key.name}"? Any client using it will immediately lose access. This cannot be undone.`,
                          )
                        ) {
                          e.preventDefault();
                        }
                      }}
                    >
                      <input type="hidden" name="intent" value="revoke" />
                      <input type="hidden" name="keyId" value={key.id} />
                      <button
                        type="submit"
                        disabled={busy}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-bolt-elements-borderColor px-3 text-xs font-medium text-red-400 hover:bg-red-500/10 disabled:opacity-60"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        Revoke
                      </button>
                    </Form>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}
