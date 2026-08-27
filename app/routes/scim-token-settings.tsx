import { Check, Copy, KeyRound, RefreshCw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { MetaFunction } from 'react-router';
import { Form, useActionData, useLoaderData, useNavigation, useRevalidator, useSubmit } from 'react-router';
import { AsyncPanelError, AsyncPanelSkeleton } from '~/components/dashboard/AsyncPanelState';
import { EnterpriseFormPage, PrimaryButton } from '~/components/enterprise/EnterpriseFormPage';
import { ConfirmationDialog } from '~/components/ui/Dialog';
import { FieldError, fieldErrorProps } from '~/components/ui/FieldError';
import {
  apiRequest,
  firstOrganizationOrNull,
  formObject,
  json,
  redirect,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import {
  formatScimTokenCount,
  formatScimTokenDate,
  formatScimTokenError,
  formatScimTokenSettingsCopy,
  formatScimTokenStatus,
  getScimTokenSettingsCopy,
  resolveScimTokenErrorCode,
  resolveScimTokenSettingsLanguage,
  scimTokenInlineStatus,
  type ScimTokenActionData,
  type ScimTokenIntent,
  type ScimTokenSettingsCopy,
  type ScimTokenSettingsLanguage,
} from '~/lib/i18n/catalogs/scim-token-settings';
import { resolveRequestLocale } from '~/lib/i18n/request-locale';
import { isReauthRedirect } from '~/lib/route-reauth';
import { classNames } from '~/utils/classNames';

/*
 * The list endpoint deliberately returns metadata only. A newly created or
 * renewed bearer secret is returned by the matching mutation and is never
 * persisted in client state beyond the one-time action response.
 */
type ScimToken = Readonly<{
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string;
  expired: boolean;
}>;

type LoadErrorKind = 'permission' | 'temporary' | null;

const MAX_TOKEN_NAME_LENGTH = 256;
const MAX_IDENTIFIER_LENGTH = 256;

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const copy = getScimTokenSettingsCopy(data?.language);

  return [
    { title: copy['scimTokenSettings.meta.title'] },
    { name: 'description', content: copy['scimTokenSettings.meta.description'] },
  ];
};

export { UserAreaRouteErrorBoundary as ErrorBoundary } from '~/components/dashboard/UserAreaRouteError';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeScimToken(value: unknown): ScimToken | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    typeof value.id !== 'string' ||
    value.id.length === 0 ||
    typeof value.name !== 'string' ||
    value.name.length === 0 ||
    typeof value.createdAt !== 'string' ||
    value.createdAt.length === 0 ||
    (value.lastUsedAt !== null && typeof value.lastUsedAt !== 'string') ||
    typeof value.expiresAt !== 'string' ||
    value.expiresAt.length === 0 ||
    typeof value.expired !== 'boolean'
  ) {
    return null;
  }

  return {
    id: value.id,
    name: value.name,
    createdAt: value.createdAt,
    lastUsedAt: value.lastUsedAt,
    expiresAt: value.expiresAt,
    expired: value.expired,
  };
}

function normalizeScimTokens(payload: unknown): ScimToken[] | null {
  if (!isRecord(payload) || !Array.isArray(payload.scimTokens)) {
    return null;
  }

  const tokens: ScimToken[] = [];

  for (const candidate of payload.scimTokens) {
    const token = normalizeScimToken(candidate);

    if (!token) {
      return null;
    }

    tokens.push(token);
  }

  return tokens;
}

export async function loader({ request }: EnterpriseLoaderArgs) {
  const language = resolveScimTokenSettingsLanguage(resolveRequestLocale(request).language);
  const organization = await firstOrganizationOrNull(request);

  if (!organization) {
    return redirect('/');
  }

  let scimTokens: ScimToken[] = [];
  let loadErrorKind: LoadErrorKind = null;

  try {
    const payload = await apiRequest<unknown>(request, `/orgs/${encodeURIComponent(organization.id)}/scim/tokens`);
    const normalizedTokens = normalizeScimTokens(payload);

    if (normalizedTokens) {
      scimTokens = normalizedTokens;
    } else {
      loadErrorKind = 'temporary';
    }
  } catch (error) {
    if (isReauthRedirect(error)) {
      throw error;
    }

    loadErrorKind = error instanceof Response && error.status === 403 ? 'permission' : 'temporary';
  }

  return json({ orgId: organization.id, scimTokens, loadErrorKind, language });
}

function actionError(errorCode: NonNullable<ScimTokenActionData['errorCode']>, status: number, field?: 'name') {
  return json<ScimTokenActionData>({ errorCode, field }, { status });
}

function oneTimeSecret(payload: unknown): string | null {
  if (!isRecord(payload) || typeof payload.token !== 'string' || payload.token.trim().length === 0) {
    return null;
  }

  return payload.token;
}

export async function action({ request }: EnterpriseActionArgs) {
  const body = formObject(await request.formData()) as {
    orgId?: string;
    name?: string;
    intent?: string;
    tokenId?: string;
  };

  const orgId = body.orgId?.trim() ?? '';

  if (!orgId || orgId.length > MAX_IDENTIFIER_LENGTH) {
    return actionError('organizationUnavailable', 400);
  }

  const rawIntent = body.intent?.trim() || 'create';

  if (rawIntent !== 'create' && rawIntent !== 'rotate' && rawIntent !== 'revoke') {
    return actionError('intentInvalid', 400);
  }

  const intent: ScimTokenIntent = rawIntent;
  const encodedOrgId = encodeURIComponent(orgId);

  if (intent === 'create') {
    const name = body.name?.trim() ?? '';

    if (!name) {
      return actionError('nameRequired', 400, 'name');
    }

    if (name.length > MAX_TOKEN_NAME_LENGTH) {
      return actionError('nameTooLong', 400, 'name');
    }

    try {
      const payload = await apiRequest<unknown>(request, `/orgs/${encodedOrgId}/scim/tokens`, {
        method: 'POST',
        body: JSON.stringify({ name }),
      });

      const token = oneTimeSecret(payload);

      if (!token) {
        return actionError('invalidResponse', 502);
      }

      return json<ScimTokenActionData>({ statusCode: 'created', token });
    } catch (error) {
      if (isReauthRedirect(error)) {
        throw error;
      }

      return actionError(await resolveScimTokenErrorCode(error, intent), scimTokenInlineStatus(error));
    }
  }

  const tokenId = body.tokenId?.trim() ?? '';

  if (!tokenId || tokenId.length > MAX_IDENTIFIER_LENGTH) {
    return actionError('tokenRequired', 400);
  }

  const endpoint = `/orgs/${encodedOrgId}/scim/tokens/${encodeURIComponent(tokenId)}`;

  try {
    if (intent === 'revoke') {
      await apiRequest(request, endpoint, { method: 'DELETE' });

      return json<ScimTokenActionData>({ statusCode: 'revoked' });
    }

    const payload = await apiRequest<unknown>(request, `${endpoint}/rotate`, { method: 'POST' });
    const token = oneTimeSecret(payload);

    if (!token) {
      return actionError('invalidResponse', 502);
    }

    return json<ScimTokenActionData>({ statusCode: 'rotated', token });
  } catch (error) {
    if (isReauthRedirect(error)) {
      throw error;
    }

    return actionError(await resolveScimTokenErrorCode(error, intent), scimTokenInlineStatus(error));
  }
}

function SecretTokenBanner({ token, copy }: { token: string; copy: ScimTokenSettingsCopy }) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  const copyLabel =
    copyState === 'copied'
      ? copy['scimTokenSettings.secret.copied']
      : copyState === 'failed'
        ? copy['scimTokenSettings.secret.copyFailed']
        : copy['scimTokenSettings.secret.copy'];

  const copyToken = async () => {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error();
      }

      await navigator.clipboard.writeText(token);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  };

  return (
    <section
      aria-labelledby="scim-token-secret-heading"
      aria-describedby="scim-token-secret-description"
      className="mb-6 min-w-0 rounded-lg border border-[var(--status-success-border)] bg-[var(--status-success-bg)] p-4"
    >
      <h2 id="scim-token-secret-heading" className="break-words text-sm font-semibold text-bolt-elements-textPrimary">
        {copy['scimTokenSettings.secret.title']}
      </h2>
      <p
        id="scim-token-secret-description"
        className="mt-1 min-w-0 break-words text-sm text-bolt-elements-textSecondary"
      >
        {copy['scimTokenSettings.secret.description']}
      </p>
      <div className="mt-3 flex min-w-0 flex-col items-stretch gap-2 sm:flex-row sm:items-start">
        <code
          dir="ltr"
          data-testid="scim-token-secret"
          className="min-w-0 flex-1 break-all rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-3 px-3 py-2 font-mono text-sm text-bolt-elements-textPrimary"
        >
          {token}
        </code>
        <button
          type="button"
          onClick={copyToken}
          className="inline-flex min-h-[44px] max-w-full shrink-0 items-center justify-center gap-2 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-center text-sm font-medium text-bolt-elements-textPrimary transition-colors hover:bg-bolt-elements-background-depth-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)]"
        >
          {copyState === 'copied' ? (
            <Check className="h-4 w-4 shrink-0" aria-hidden />
          ) : (
            <Copy className="h-4 w-4 shrink-0" aria-hidden />
          )}
          <span className="min-w-0 break-words" aria-live="polite" aria-atomic="true">
            {copyLabel}
          </span>
        </button>
      </div>
    </section>
  );
}

function TokenNameField({ copy, error }: { copy: ScimTokenSettingsCopy; error?: string }) {
  const fieldId = 'scim-token-name';

  return (
    <div className="min-w-0">
      <label htmlFor={fieldId} className="block min-w-0 break-words text-sm font-medium text-bolt-elements-textPrimary">
        {copy['scimTokenSettings.create.name']}
      </label>
      <input
        id={fieldId}
        name="name"
        type="text"
        placeholder={copy['scimTokenSettings.create.namePlaceholder']}
        required
        maxLength={MAX_TOKEN_NAME_LENGTH}
        autoComplete="off"
        className={classNames(
          'mt-2 min-h-[44px] w-full min-w-0 rounded-md border bg-bolt-elements-background-depth-1 px-3 py-2 text-sm outline-none focus:border-bolt-elements-focus',
          error ? 'border-[var(--vc-ide-accent-error)]' : 'border-bolt-elements-borderColor',
        )}
        {...fieldErrorProps(fieldId, error)}
      />
      <FieldError fieldId={fieldId} error={error} />
    </div>
  );
}

function TokenDate({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="break-words text-xs font-medium text-bolt-elements-textTertiary">{label}</dt>
      <dd className="mt-1 min-w-0 break-words text-sm text-bolt-elements-textSecondary">{value}</dd>
    </div>
  );
}

export default function ScimTokenSettingsPage() {
  const { orgId, scimTokens, loadErrorKind, language } = useLoaderData<typeof loader>();
  const resolvedLanguage: ScimTokenSettingsLanguage = resolveScimTokenSettingsLanguage(language);
  const copy = getScimTokenSettingsCopy(resolvedLanguage);
  const actionData = useActionData<typeof action>() as ScimTokenActionData | undefined;
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const submit = useSubmit();
  const busy = navigation.state !== 'idle';
  const pendingIntent = navigation.formData?.get('intent');
  const pendingTokenId = navigation.formData?.get('tokenId');
  const creating = busy && pendingIntent === 'create';
  const [tokenPendingRevoke, setTokenPendingRevoke] = useState<{ id: string; name: string } | null>(null);
  const status = actionData ? formatScimTokenStatus(actionData, resolvedLanguage) : undefined;
  const error = actionData ? formatScimTokenError(actionData, resolvedLanguage) : undefined;
  const nameError = actionData?.field === 'name' ? error : undefined;

  return (
    <EnterpriseFormPage
      title={copy['scimTokenSettings.page.title']}
      description={copy['scimTokenSettings.page.description']}
      status={status}
      error={nameError ? undefined : error}
    >
      {actionData?.token ? <SecretTokenBanner key={actionData.token} token={actionData.token} copy={copy} /> : null}

      {loadErrorKind ? (
        revalidator.state !== 'idle' ? (
          <AsyncPanelSkeleton label={copy['scimTokenSettings.load.loading']} rows={4} />
        ) : (
          <AsyncPanelError
            title={
              loadErrorKind === 'permission'
                ? copy['scimTokenSettings.load.permissionTitle']
                : copy['scimTokenSettings.load.errorTitle']
            }
            description={
              loadErrorKind === 'permission'
                ? copy['scimTokenSettings.load.permissionDescription']
                : copy['scimTokenSettings.load.errorDescription']
            }
            tone={loadErrorKind === 'permission' ? 'warning' : 'error'}
            onRetry={loadErrorKind === 'temporary' ? () => revalidator.revalidate() : undefined}
            retryLabel={copy['scimTokenSettings.load.retry']}
          />
        )
      ) : (
        <>
          <section className="min-w-0" aria-labelledby="scim-token-create-title">
            <h2
              id="scim-token-create-title"
              className="break-words text-base font-semibold text-bolt-elements-textPrimary"
            >
              {copy['scimTokenSettings.create.title']}
            </h2>
            <p className="mt-1 min-w-0 break-words text-sm text-bolt-elements-textSecondary">
              {copy['scimTokenSettings.create.description']}
            </p>
            <Form method="post" className="mt-4 min-w-0 space-y-4">
              <input type="hidden" name="orgId" value={orgId} />
              <input type="hidden" name="intent" value="create" />
              <TokenNameField copy={copy} error={nameError} />
              <div className="grid min-w-0 sm:inline-grid">
                <PrimaryButton
                  disabled={busy}
                  aria-busy={creating}
                  className="max-w-full whitespace-normal break-words text-center leading-tight"
                >
                  {creating ? copy['scimTokenSettings.create.submitting'] : copy['scimTokenSettings.create.submit']}
                </PrimaryButton>
              </div>
            </Form>
          </section>

          <hr className="my-8 border-bolt-elements-borderColor" />

          <section className="min-w-0" aria-labelledby="scim-token-list-title">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h2
                id="scim-token-list-title"
                className="min-w-0 break-words text-base font-semibold text-bolt-elements-textPrimary"
              >
                {copy['scimTokenSettings.list.title']}
              </h2>
              <span className="max-w-full rounded-full border border-bolt-elements-borderColor px-2 py-0.5 text-xs font-normal text-bolt-elements-textSecondary">
                {formatScimTokenCount(scimTokens.length, resolvedLanguage)}
              </span>
            </div>

            {scimTokens.length === 0 ? (
              <div className="mt-4 flex min-w-0 flex-col items-center gap-3 rounded-lg border border-bolt-elements-borderColor px-4 py-8 text-center sm:px-6 sm:py-10">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-bolt-elements-background-depth-3">
                  <KeyRound className="h-5 w-5 text-bolt-elements-textTertiary" aria-hidden />
                </span>
                <div className="min-w-0">
                  <h3 className="break-words text-sm font-semibold text-bolt-elements-textPrimary">
                    {copy['scimTokenSettings.list.emptyTitle']}
                  </h3>
                  <p className="mt-1 break-words text-sm text-bolt-elements-textSecondary">
                    {copy['scimTokenSettings.list.emptyDescription']}
                  </p>
                </div>
              </div>
            ) : (
              <ul className="mt-4 min-w-0 overflow-hidden rounded-lg border border-bolt-elements-borderColor">
                {scimTokens.map((token, index) => {
                  const rotating = busy && pendingIntent === 'rotate' && pendingTokenId === token.id;
                  const revoking = busy && pendingIntent === 'revoke' && pendingTokenId === token.id;

                  const rotateAria = formatScimTokenSettingsCopy(copy['scimTokenSettings.action.rotateAria'], {
                    name: token.name,
                  });
                  const rotatingAria = formatScimTokenSettingsCopy(copy['scimTokenSettings.action.rotatingAria'], {
                    name: token.name,
                  });
                  const revokeAria = formatScimTokenSettingsCopy(copy['scimTokenSettings.action.revokeAria'], {
                    name: token.name,
                  });
                  const revokingAria = formatScimTokenSettingsCopy(copy['scimTokenSettings.action.revokingAria'], {
                    name: token.name,
                  });

                  return (
                    <li
                      key={token.id}
                      className={classNames(
                        'min-w-0 p-4 sm:p-5',
                        index > 0 && 'border-t border-bolt-elements-borderColor',
                      )}
                    >
                      <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 flex-wrap items-start gap-2">
                            <p
                              dir="auto"
                              className="min-w-0 break-all text-sm font-semibold text-bolt-elements-textPrimary"
                            >
                              {token.name}
                            </p>
                            {token.expired ? (
                              <span className="shrink-0 rounded-full border border-[var(--status-error-border)] px-2 py-0.5 text-xs font-normal text-[var(--status-error-text)]">
                                {copy['scimTokenSettings.token.expired']}
                              </span>
                            ) : null}
                          </div>
                          <dl className="mt-4 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
                            <TokenDate
                              label={copy['scimTokenSettings.token.created']}
                              value={formatScimTokenDate(token.createdAt, resolvedLanguage)}
                            />
                            <TokenDate
                              label={copy['scimTokenSettings.token.lastUsed']}
                              value={
                                token.lastUsedAt
                                  ? formatScimTokenDate(token.lastUsedAt, resolvedLanguage)
                                  : copy['scimTokenSettings.token.neverUsed']
                              }
                            />
                            <TokenDate
                              label={copy['scimTokenSettings.token.expires']}
                              value={formatScimTokenDate(token.expiresAt, resolvedLanguage)}
                            />
                          </dl>
                        </div>
                        <div className="grid min-w-0 shrink-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:w-auto">
                          <Form method="post" className="min-w-0">
                            <input type="hidden" name="orgId" value={orgId} />
                            <input type="hidden" name="intent" value="rotate" />
                            <input type="hidden" name="tokenId" value={token.id} />
                            <button
                              type="submit"
                              disabled={busy}
                              aria-busy={rotating}
                              aria-label={rotating ? rotatingAria : rotateAria}
                              className="inline-flex min-h-[44px] w-full max-w-full items-center justify-center gap-1.5 rounded-md border border-bolt-elements-borderColor px-3 py-2 text-center text-xs font-medium text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)] disabled:opacity-60"
                            >
                              <RefreshCw
                                className={classNames(
                                  'h-3.5 w-3.5 shrink-0',
                                  rotating && 'animate-spin motion-reduce:animate-none',
                                )}
                                aria-hidden
                              />
                              <span className="min-w-0 break-words">
                                {rotating
                                  ? copy['scimTokenSettings.action.rotating']
                                  : copy['scimTokenSettings.action.rotate']}
                              </span>
                            </button>
                          </Form>
                          <Form
                            method="post"
                            className="min-w-0"
                            onSubmit={(event) => {
                              event.preventDefault();
                              setTokenPendingRevoke({ id: token.id, name: token.name });
                            }}
                          >
                            <input type="hidden" name="orgId" value={orgId} />
                            <input type="hidden" name="intent" value="revoke" />
                            <input type="hidden" name="tokenId" value={token.id} />
                            <button
                              type="submit"
                              disabled={busy}
                              aria-busy={revoking}
                              aria-label={revoking ? revokingAria : revokeAria}
                              className="inline-flex min-h-[44px] w-full max-w-full items-center justify-center gap-1.5 rounded-md border border-bolt-elements-borderColor px-3 py-2 text-center text-xs font-medium text-[var(--status-error-text)] hover:bg-[var(--status-error-bg)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)] disabled:opacity-60"
                            >
                              <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                              <span className="min-w-0 break-words">
                                {revoking
                                  ? copy['scimTokenSettings.action.revoking']
                                  : copy['scimTokenSettings.action.revoke']}
                              </span>
                            </button>
                          </Form>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}

      <ConfirmationDialog
        isOpen={tokenPendingRevoke !== null}
        onClose={() => setTokenPendingRevoke(null)}
        onConfirm={() => {
          const pending = tokenPendingRevoke;
          setTokenPendingRevoke(null);

          if (pending) {
            submit({ orgId, intent: 'revoke', tokenId: pending.id }, { method: 'post' });
          }
        }}
        title={formatScimTokenSettingsCopy(copy['scimTokenSettings.dialog.title'], {
          name: tokenPendingRevoke?.name ?? '',
        })}
        description={copy['scimTokenSettings.dialog.description']}
        confirmLabel={copy['scimTokenSettings.dialog.confirm']}
        cancelLabel={copy['scimTokenSettings.dialog.cancel']}
        variant="destructive"
        isLoading={busy && pendingIntent === 'revoke'}
      />
    </EnterpriseFormPage>
  );
}
