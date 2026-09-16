import * as RadixDialog from '@radix-ui/react-dialog';
import { Check, Copy, KeyRound, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { MetaFunction } from 'react-router';
import { data as json } from 'react-router';
import { Form, useActionData, useLoaderData, useNavigation, useSubmit } from 'react-router';
import { AppShell, StatusPill } from '~/components/dashboard/SaaSLayout';
import { ConfirmationDialog, Dialog, DialogTitle } from '~/components/ui/Dialog';
import { EmptyState } from '~/components/ui/EmptyState';
import { RelativeTime } from '~/components/ui/RelativeTime';
import { apiRequest, type EnterpriseActionArgs, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';
import {
  formatApiKeyCount,
  formatApiKeyDate,
  getApiKeysCopy,
  interpolateApiKeysWorkspaceSettingsCopy,
  resolveApiKeyActionErrorCode,
  type ApiKeyActionErrorCode,
} from '~/lib/i18n/catalogs/api-keys-workspace-settings';
import { resolveRequestLocale } from '~/lib/i18n/request-locale';
import { shouldRethrowActionError } from '~/lib/route-reauth';

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const copy = getApiKeysCopy(data?.language).seo;

  return [{ title: copy.title }, { name: 'description', content: copy.description }];
};
export { UserAreaRouteErrorBoundary as ErrorBoundary } from '~/components/dashboard/UserAreaRouteError';

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

const API_KEY_SCOPES: readonly ApiKeyScope[] = ['read', 'write', 'admin'];
const MASKED_API_KEY_PREFIX = 'vck_…';

const EXPIRY_OPTIONS = [
  ['', 'never'],
  ['30', 'days30'],
  ['90', 'days90'],
  ['365', 'year1'],
] as const;

export async function loader({ request }: EnterpriseLoaderArgs) {
  const language = resolveRequestLocale(request).language;
  const data = await apiRequest<{ keys: ApiKey[] }>(request, '/api/keys');

  return { keys: data.keys, language };
}

type ActionResult =
  | { ok: true; intent: 'create'; token: string; key: ApiKey }
  | { ok: true; intent: 'revoke'; id: string }
  | { ok: false; intent: 'create' | 'revoke' | 'unknown'; errorCode: ApiKeyActionErrorCode };

export async function action({ request }: EnterpriseActionArgs) {
  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');
  const actionIntent = intent === 'create' || intent === 'revoke' ? intent : 'unknown';

  try {
    if (intent === 'revoke') {
      const id = String(form.get('keyId') ?? '');

      if (!id) {
        return json<ActionResult>({ ok: false, intent: 'revoke', errorCode: 'missingKeyId' }, { status: 400 });
      }

      await apiRequest(request, `/api/keys/${encodeURIComponent(id)}`, { method: 'DELETE' });

      return json<ActionResult>({ ok: true, intent: 'revoke', id });
    }

    if (intent === 'create') {
      const name = String(form.get('name') ?? '').trim();
      const scopes = API_KEY_SCOPES.filter((scope) => form.get(`scope.${scope}`) === 'on');
      const expiresInDaysRaw = String(form.get('expiresInDays') ?? '').trim();
      const expiresInDays = expiresInDaysRaw ? Number(expiresInDaysRaw) : undefined;

      if (!name) {
        return json<ActionResult>({ ok: false, intent: 'create', errorCode: 'nameRequired' }, { status: 400 });
      }

      if (scopes.length === 0) {
        return json<ActionResult>({ ok: false, intent: 'create', errorCode: 'scopeRequired' }, { status: 400 });
      }

      if (expiresInDaysRaw && !EXPIRY_OPTIONS.some(([value]) => value === expiresInDaysRaw)) {
        return json<ActionResult>({ ok: false, intent: 'create', errorCode: 'expiryInvalid' }, { status: 400 });
      }

      const created = await apiRequest<{ key: ApiKey & { token: string } }>(request, '/api/keys', {
        method: 'POST',
        body: JSON.stringify({ name, scopes, expiresInDays }),
      });

      const { token, ...key } = created.key;

      return json<ActionResult>({ ok: true, intent: 'create', token, key });
    }

    return json<ActionResult>({ ok: false, intent: 'unknown', errorCode: 'unknownAction' }, { status: 400 });
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

    /*
     * Never render provider/API response bodies: they can contain English-only
     * technical details or sensitive data. Map the status to reviewed UI copy.
     */
    if (error instanceof Response) {
      return json<ActionResult>(
        { ok: false, intent: actionIntent, errorCode: resolveApiKeyActionErrorCode(error.status) },
        { status: error.status },
      );
    }

    return json<ActionResult>({ ok: false, intent: actionIntent, errorCode: 'requestFailed' }, { status: 500 });
  }
}

const BLUE_CTA =
  'inline-flex min-h-[44px] items-center justify-center rounded-md bg-[var(--vc-ide-accent-action)] px-4 text-sm font-medium text-[var(--vc-ide-on-accent-action)] transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)] disabled:cursor-not-allowed disabled:opacity-60';

function RevokeKeyButton({
  apiKey,
  busy,
  label,
  onRequest,
  className,
}: {
  apiKey: Pick<ApiKey, 'id' | 'name'>;
  busy: boolean;
  label: string;
  onRequest: (key: Pick<ApiKey, 'id' | 'name'>) => void;
  className?: string;
}) {
  return (
    <Form
      method="post"
      className={className}
      onSubmit={(event) => {
        event.preventDefault();
        onRequest(apiKey);
      }}
    >
      <input type="hidden" name="intent" value="revoke" />
      <input type="hidden" name="keyId" value={apiKey.id} />
      <button
        type="submit"
        disabled={busy}
        style={{ color: 'var(--status-error-text)' }}
        className="inline-flex min-h-[44px] w-full min-w-0 items-center justify-center gap-1.5 rounded-md border border-bolt-elements-borderColor px-3 text-center text-xs font-medium hover:bg-[var(--status-error-bg)] disabled:opacity-60 sm:w-auto"
      >
        <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="break-words">{label}</span>
      </button>
    </Form>
  );
}

export default function ApiKeysPage() {
  const { keys, language } = useLoaderData<typeof loader>();
  const copy = getApiKeysCopy(language);
  const scopeOptions = API_KEY_SCOPES.map((value) => ({ value, ...copy.scopes[value] }));
  const actionData = useActionData<typeof action>() as ActionResult | undefined;
  const navigation = useNavigation();
  const busy = navigation.state !== 'idle';
  const submit = useSubmit();
  const [createOpen, setCreateOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [keyPendingRevoke, setKeyPendingRevoke] = useState<{ id: string; name: string } | null>(null);

  const createdToken = actionData?.ok && actionData.intent === 'create' ? actionData.token : null;
  const error = actionData && !actionData.ok ? copy.errors[actionData.errorCode] : null;
  const errorIntent = actionData && !actionData.ok ? actionData.intent : null;

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
    <AppShell title={copy.shell.title} description={copy.shell.description}>
      <div className="min-w-0 space-y-6">
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
            <p className="break-words text-sm font-semibold" style={{ color: 'var(--status-warning-text)' }}>
              {copy.created.notice}
            </p>
            <div className="mt-2 flex min-w-0 flex-col items-stretch gap-2 sm:flex-row sm:items-center">
              <code
                className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-3 px-3 py-2 text-sm text-bolt-elements-textPrimary"
                style={{ fontFamily: 'var(--vc-font-code)' }}
              >
                {createdToken}
              </code>
              <button
                type="button"
                onClick={copyToken}
                className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-1.5 rounded-md border border-bolt-elements-borderColor px-3 text-xs font-medium text-bolt-elements-textPrimary transition-colors hover:bg-bolt-elements-background-depth-3"
              >
                {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
                {copied ? copy.created.copied : copy.created.copy}
              </button>
            </div>
          </div>
        ) : null}

        {error && errorIntent !== 'create' ? (
          <p
            role="alert"
            className="rounded-md border border-[var(--status-error-border)] bg-[var(--status-error-bg)] px-3 py-2 text-sm"
            style={{ color: 'var(--status-error-text)' }}
          >
            {error}
          </p>
        ) : null}

        <section className="min-w-0 overflow-hidden rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-bolt-elements-borderColor p-5 sm:p-6">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <h2 className="break-words text-base font-semibold text-bolt-elements-textPrimary">{copy.list.title}</h2>
              <StatusPill label={formatApiKeyCount(language, keys.length)} />
            </div>
            <button type="button" onClick={() => setCreateOpen(true)} className={BLUE_CTA}>
              {copy.list.create}
            </button>
          </div>

          {keys.length === 0 ? (
            <EmptyState
              icon={KeyRound}
              title={copy.list.emptyTitle}
              description={copy.list.emptyDescription}
              actionLabel={copy.list.create}
              onAction={() => setCreateOpen(true)}
            />
          ) : (
            <>
              <ul className="divide-y divide-bolt-elements-borderColor xl:hidden" data-testid="api-key-mobile-list">
                {keys.map((key) => (
                  <li key={key.id} className="min-w-0 p-5 sm:p-6">
                    <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="break-words text-sm font-semibold text-bolt-elements-textPrimary">{key.name}</p>
                        <code
                          className="mt-1 block truncate text-xs text-bolt-elements-textTertiary"
                          style={{ fontFamily: 'var(--vc-font-code)' }}
                        >
                          {key.keyPrefix ? `${key.keyPrefix}…` : MASKED_API_KEY_PREFIX}
                        </code>
                      </div>
                      <RevokeKeyButton
                        apiKey={key}
                        busy={busy}
                        label={copy.revoke.action}
                        onRequest={setKeyPendingRevoke}
                        className="w-full shrink-0 sm:w-auto"
                      />
                    </div>

                    <dl className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-4">
                      <div className="min-w-0">
                        <dt className="break-words text-xs font-medium text-bolt-elements-textTertiary">
                          {copy.fields.scopes}
                        </dt>
                        <dd className="mt-1 flex flex-wrap gap-1.5">
                          {key.scopes.map((scope) => (
                            <span
                              key={scope}
                              className="rounded-full border border-bolt-elements-borderColor px-2 py-0.5 text-xs text-bolt-elements-textSecondary"
                            >
                              {copy.scopes[scope].label}
                            </span>
                          ))}
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="break-words text-xs font-medium text-bolt-elements-textTertiary">
                          {copy.fields.lastUsed}
                        </dt>
                        <dd className="mt-1 text-sm text-bolt-elements-textSecondary">
                          {key.lastUsedAt ? <RelativeTime value={key.lastUsedAt} /> : copy.fields.never}
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="break-words text-xs font-medium text-bolt-elements-textTertiary">
                          {copy.fields.created}
                        </dt>
                        <dd className="mt-1 text-sm text-bolt-elements-textSecondary">
                          <RelativeTime value={key.createdAt} />
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="break-words text-xs font-medium text-bolt-elements-textTertiary">
                          {copy.fields.expiration}
                        </dt>
                        <dd className="mt-1 text-sm text-bolt-elements-textSecondary">
                          {key.expiresAt ? formatApiKeyDate(key.expiresAt, language) : copy.fields.neverExpires}
                        </dd>
                      </div>
                    </dl>
                  </li>
                ))}
              </ul>

              <div
                className="hidden max-w-full overflow-x-auto overscroll-x-contain xl:block"
                role="region"
                aria-label={copy.fields.tableAria}
                tabIndex={0}
                data-testid="api-key-table-scroll-region"
              >
                <table className="w-full min-w-[760px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-bolt-elements-borderColor text-left text-xs uppercase tracking-wide text-bolt-elements-textSecondary">
                      <th className="px-5 py-3 font-medium">{copy.fields.name}</th>
                      <th className="px-5 py-3 font-medium">{copy.fields.key}</th>
                      <th className="px-5 py-3 font-medium">{copy.fields.scopes}</th>
                      <th className="px-5 py-3 font-medium">{copy.fields.lastUsed}</th>
                      <th className="px-5 py-3 font-medium">{copy.fields.created}</th>
                      <th className="px-5 py-3 font-medium">
                        <span className="sr-only">{copy.fields.actions}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {keys.map((key) => (
                      <tr
                        key={key.id}
                        className="border-b border-bolt-elements-borderColor align-middle last:border-b-0"
                      >
                        <td className="px-5 py-3 font-medium text-bolt-elements-textPrimary">{key.name}</td>
                        <td
                          className="px-5 py-3 text-xs text-bolt-elements-textTertiary"
                          style={{ fontFamily: 'var(--vc-font-code)' }}
                        >
                          {key.keyPrefix ? `${key.keyPrefix}…` : MASKED_API_KEY_PREFIX}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex flex-wrap gap-1.5">
                            {key.scopes.map((scope) => (
                              <span
                                key={scope}
                                className="rounded-full border border-bolt-elements-borderColor px-2 py-0.5 text-xs text-bolt-elements-textSecondary"
                              >
                                {copy.scopes[scope].label}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-5 py-3 text-bolt-elements-textSecondary">
                          {key.lastUsedAt ? <RelativeTime value={key.lastUsedAt} /> : copy.fields.never}
                        </td>
                        <td className="px-5 py-3 text-bolt-elements-textSecondary">
                          <RelativeTime value={key.createdAt} />
                          <span className="block text-xs text-bolt-elements-textTertiary">
                            {key.expiresAt
                              ? interpolateApiKeysWorkspaceSettingsCopy(copy.fields.expiresOn, {
                                  date: formatApiKeyDate(key.expiresAt, language),
                                })
                              : copy.fields.neverExpires}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <RevokeKeyButton
                            apiKey={key}
                            busy={busy}
                            label={copy.revoke.action}
                            onRequest={setKeyPendingRevoke}
                            className="inline"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </div>

      <RadixDialog.Root open={createOpen} onOpenChange={setCreateOpen}>
        {createOpen ? (
          <Dialog onClose={() => setCreateOpen(false)} onBackdrop={() => setCreateOpen(false)}>
            <div className="p-6">
              <DialogTitle asChild>
                <h2 className="break-words text-base font-semibold text-bolt-elements-textPrimary">
                  {copy.createDialog.title}
                </h2>
              </DialogTitle>
              <p className="mt-1 break-words text-sm leading-5 text-bolt-elements-textSecondary">
                {copy.createDialog.description}
              </p>

              {error && errorIntent === 'create' ? (
                <p
                  role="alert"
                  className="mt-4 rounded-md border border-[var(--status-error-border)] bg-[var(--status-error-bg)] px-3 py-2 text-sm"
                  style={{ color: 'var(--status-error-text)' }}
                >
                  {error}
                </p>
              ) : null}

              <Form method="post" noValidate className="mt-4 space-y-5">
                <input type="hidden" name="intent" value="create" />

                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-bolt-elements-textPrimary">
                    {copy.createDialog.name}
                  </label>
                  <input
                    id="name"
                    name="name"
                    type="text"
                    required
                    maxLength={120}
                    placeholder={copy.createDialog.namePlaceholder}
                    className="mt-1 min-h-[44px] w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm text-bolt-elements-textPrimary focus:border-bolt-elements-focus focus:outline-none"
                  />
                </div>

                <fieldset>
                  <legend className="text-sm font-medium text-bolt-elements-textPrimary">
                    {copy.createDialog.scopes}
                  </legend>
                  <div className="mt-2 space-y-2">
                    {scopeOptions.map((option) => (
                      <label key={option.value} className="flex min-w-0 items-start gap-3">
                        <input
                          type="checkbox"
                          name={`scope.${option.value}`}
                          defaultChecked={option.value === 'read'}
                          className="mt-0.5 h-4 w-4 rounded border-bolt-elements-borderColor"
                        />
                        <span className="min-w-0">
                          <span className="break-words text-sm font-medium text-bolt-elements-textPrimary">
                            {option.label}
                          </span>
                          <span className="block break-words text-xs leading-5 text-bolt-elements-textTertiary">
                            {option.detail}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <div>
                  <label htmlFor="expiresInDays" className="block text-sm font-medium text-bolt-elements-textPrimary">
                    {copy.createDialog.expiration}
                  </label>
                  <select
                    id="expiresInDays"
                    name="expiresInDays"
                    defaultValue="90"
                    className="mt-1 min-h-[44px] w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm text-bolt-elements-textPrimary focus:border-bolt-elements-focus focus:outline-none"
                  >
                    {EXPIRY_OPTIONS.map((option) => (
                      <option key={option[0] || 'never'} value={option[0]}>
                        {copy.expiry[option[1]]}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col-reverse justify-end gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => setCreateOpen(false)}
                    className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-bolt-elements-borderColor px-4 text-sm font-medium text-bolt-elements-textPrimary transition-colors hover:bg-bolt-elements-background-depth-3"
                  >
                    {copy.createDialog.cancel}
                  </button>
                  <button type="submit" disabled={busy} aria-busy={busy} className={BLUE_CTA}>
                    {busy ? copy.createDialog.creating : copy.createDialog.create}
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
        title={interpolateApiKeysWorkspaceSettingsCopy(copy.revoke.title, {
          name: keyPendingRevoke?.name ?? '',
        })}
        description={copy.revoke.description}
        confirmLabel={copy.revoke.confirm}
        variant="destructive"
      />
    </AppShell>
  );
}
