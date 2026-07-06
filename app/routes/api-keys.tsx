import * as RadixDialog from '@radix-ui/react-dialog';
import { Check, Copy, KeyRound, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { MetaFunction } from 'react-router';
import { data as json } from 'react-router';
import { Form, useActionData, useLoaderData, useNavigation, useSubmit } from 'react-router';
import { AppShell, StatusPill } from '~/components/dashboard/SaaSLayout';
import { ConfirmationDialog, Dialog, DialogTitle } from '~/components/ui/Dialog';
import { RelativeTime } from '~/components/ui/RelativeTime';
import { apiRequest, type EnterpriseActionArgs, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';
import { shouldRethrowActionError } from '~/lib/route-reauth';

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

const BLUE_CTA =
  'inline-flex h-9 items-center justify-center rounded-md bg-[var(--vc-ide-accent-action)] px-4 text-sm font-medium text-white transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)] disabled:cursor-not-allowed disabled:opacity-60';

export default function ApiKeysPage() {
  const { keys } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as ActionResult | undefined;
  const navigation = useNavigation();
  const busy = navigation.state !== 'idle';
  const submit = useSubmit();
  const [createOpen, setCreateOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [keyPendingRevoke, setKeyPendingRevoke] = useState<{ id: string; name: string } | null>(null);

  const createdToken = actionData?.ok && actionData.intent === 'create' ? actionData.token : null;
  const error = actionData && !actionData.ok ? actionData.error : null;

  /* Close the create dialog once the key lands (the banner takes over). */
  useEffect(() => {
    if (createdToken) {
      setCreateOpen(false);
      setCopied(false);
    }
  }, [createdToken]);

  const copyToken = async () => {
    if (!createdToken) {
      return;
    }

    try {
      await navigator.clipboard.writeText(createdToken);
      setCopied(true);
    } catch {
      // Clipboard blocked — the token is still selectable in the <code> block.
    }
  };

  return (
    <AppShell title="API keys" description="Create, scope, rotate and revoke API keys for automation.">
      <div className="space-y-6">
        {createdToken ? (
          <div
            role="status"
            aria-live="polite"
            className="rounded-md px-4 py-3"
            style={{
              background: 'color-mix(in srgb, var(--vc-ide-accent-warning) 12%, transparent)',
              borderLeft: '3px solid var(--vc-ide-accent-warning)',
            }}
          >
            <p className="text-sm font-semibold" style={{ color: 'var(--status-warning-text)' }}>
              Key created — copy it now. This is the only time the full key is shown.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <code
                className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-3 px-3 py-2 text-sm text-bolt-elements-textPrimary"
                style={{ fontFamily: 'var(--vc-font-code)' }}
              >
                {createdToken}
              </code>
              <button
                type="button"
                onClick={copyToken}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-bolt-elements-borderColor px-3 text-xs font-medium text-bolt-elements-textPrimary transition-colors hover:bg-bolt-elements-background-depth-3"
              >
                {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        ) : null}

        {error ? (
          <p
            role="alert"
            className="rounded-md border border-[var(--status-error-border)] bg-[var(--status-error-bg)] px-3 py-2 text-sm"
            style={{ color: 'var(--status-error-text)' }}
          >
            {error}
          </p>
        ) : null}

        <section className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-bolt-elements-borderColor p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <h2 className="text-base font-semibold text-bolt-elements-textPrimary">Active keys</h2>
              <StatusPill label={`${keys.length} key${keys.length === 1 ? '' : 's'}`} />
            </div>
            <button type="button" onClick={() => setCreateOpen(true)} className={BLUE_CTA}>
              Create key
            </button>
          </div>

          {keys.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-bolt-elements-background-depth-3">
                <KeyRound className="h-5 w-5 text-bolt-elements-textTertiary" aria-hidden />
              </span>
              <p className="text-sm text-bolt-elements-textSecondary">No API keys yet. Create one to get started.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-bolt-elements-borderColor text-left text-xs uppercase tracking-wide text-bolt-elements-textSecondary">
                    <th className="px-5 py-3 font-medium">Name</th>
                    <th className="px-5 py-3 font-medium">Key</th>
                    <th className="px-5 py-3 font-medium">Scopes</th>
                    <th className="px-5 py-3 font-medium">Last used</th>
                    <th className="px-5 py-3 font-medium">Created</th>
                    <th className="px-5 py-3 font-medium">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {keys.map((key) => (
                    <tr key={key.id} className="border-b border-bolt-elements-borderColor align-middle last:border-b-0">
                      <td className="px-5 py-3 font-medium text-bolt-elements-textPrimary">{key.name}</td>
                      <td
                        className="px-5 py-3 text-xs text-bolt-elements-textTertiary"
                        style={{ fontFamily: 'var(--vc-font-code)' }}
                      >
                        {key.keyPrefix ? `${key.keyPrefix}…` : 'vck_…'}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {key.scopes.map((scope) => (
                            <span
                              key={scope}
                              className="rounded-full border border-bolt-elements-borderColor px-2 py-0.5 text-xs text-bolt-elements-textSecondary"
                            >
                              {scope}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-bolt-elements-textSecondary">
                        {key.lastUsedAt ? <RelativeTime value={key.lastUsedAt} /> : 'Never'}
                      </td>
                      <td className="px-5 py-3 text-bolt-elements-textSecondary">
                        <RelativeTime value={key.createdAt} />
                        <span className="block text-xs text-bolt-elements-textTertiary">
                          {key.expiresAt ? `Expires ${formatDate(key.expiresAt)}` : 'Never expires'}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Form
                          method="post"
                          className="inline"
                          onSubmit={(e) => {
                            e.preventDefault();
                            setKeyPendingRevoke({ id: key.id, name: key.name });
                          }}
                        >
                          <input type="hidden" name="intent" value="revoke" />
                          <input type="hidden" name="keyId" value={key.id} />
                          <button
                            type="submit"
                            disabled={busy}
                            style={{ color: 'var(--status-error-text)' }}
                            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-bolt-elements-borderColor px-3 text-xs font-medium hover:bg-[var(--status-error-bg)] disabled:opacity-60"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                            Revoke
                          </button>
                        </Form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <RadixDialog.Root open={createOpen} onOpenChange={setCreateOpen}>
        {createOpen ? (
          <Dialog onClose={() => setCreateOpen(false)} onBackdrop={() => setCreateOpen(false)}>
            <div className="p-6">
              <DialogTitle asChild>
                <h2 className="text-base font-semibold text-bolt-elements-textPrimary">Create an API key</h2>
              </DialogTitle>
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

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setCreateOpen(false)}
                    className="inline-flex h-9 items-center justify-center rounded-md border border-bolt-elements-borderColor px-4 text-sm font-medium text-bolt-elements-textPrimary transition-colors hover:bg-bolt-elements-background-depth-3"
                  >
                    Cancel
                  </button>
                  <button type="submit" disabled={busy} aria-busy={busy} className={BLUE_CTA}>
                    {busy ? 'Creating…' : 'Create key'}
                  </button>
                </div>
              </Form>
            </div>
          </Dialog>
        ) : null}
      </RadixDialog.Root>
      <ConfirmationDialog
        isOpen={keyPendingRevoke !== null}
        onClose={() => setKeyPendingRevoke(null)}
        onConfirm={() => {
          const pending = keyPendingRevoke;
          setKeyPendingRevoke(null);

          if (pending) {
            submit({ intent: 'revoke', keyId: pending.id }, { method: 'post' });
          }
        }}
        title={`Revoke key "${keyPendingRevoke?.name ?? ''}"?`}
        description="Any client using it will immediately lose access. This cannot be undone."
        confirmLabel="Revoke key"
        variant="destructive"
      />
    </AppShell>
  );
}
