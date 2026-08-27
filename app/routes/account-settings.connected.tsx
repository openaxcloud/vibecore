import { AlertTriangle, Chrome, Github, Link2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { MetaFunction } from 'react-router';
import {
  Form,
  Link,
  useActionData,
  useLoaderData,
  useNavigation,
  useRevalidator,
  useSearchParams,
  useSubmit,
} from 'react-router';
import { AsyncPanelError, AsyncPanelSkeleton } from '~/components/dashboard/AsyncPanelState';
import { StatusPill } from '~/components/dashboard/SaaSLayout';
import { ConfirmationDialog } from '~/components/ui/Dialog';
import { useConnectorPopup } from '~/lib/chat/use-connector-popup';
import {
  apiRequest,
  formObject,
  json,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import {
  connectedAccountInlineStatus,
  connectedAccountOauthError,
  connectedAccountProviderLabel,
  connectedAccountReconnectReason,
  formatAccountSettingsConnectedCopy,
  formatConnectedAccountDate,
  formatConnectedAccountError,
  formatConnectedAccountStatus,
  formatReconnectionAlertCount,
  getAccountSettingsConnectedCopy,
  resolveAccountSettingsConnectedLanguage,
  resolveConnectedAccountActionError,
  resolveConnectedAccountClientError,
  resolveConnectedAccountPopupError,
  type AccountSettingsConnectedAction,
  type AccountSettingsConnectedActionData,
  type AccountSettingsConnectedCopy,
  type AccountSettingsConnectedErrorCode,
  type AccountSettingsConnectedKey,
  type AccountSettingsConnectedLanguage,
} from '~/lib/i18n/catalogs/account-settings-connected';
import { resolveRequestLocale } from '~/lib/i18n/request-locale';
import { isReauthRedirect } from '~/lib/route-reauth';
import { classNames } from '~/utils/classNames';

type ProviderKind = 'integration' | 'identity';
type ProviderCopyKey = 'githubIntegration' | 'githubIdentity' | 'googleIdentity' | 'microsoftIdentity';
type LoadErrorKind = 'permission' | 'temporary' | null;

type ProviderDescriptor = Readonly<{
  key: string;
  apiProvider: string;
  copyKey: ProviderCopyKey;
  kind: ProviderKind;
  connectPath?: string;
  icon: typeof Github;
}>;

const PROVIDERS: readonly ProviderDescriptor[] = [
  {
    key: 'github',
    apiProvider: 'github',
    copyKey: 'githubIntegration',
    kind: 'integration',
    icon: Github,
  },
  {
    key: 'github-signin',
    apiProvider: 'github',
    copyKey: 'githubIdentity',
    kind: 'identity',
    connectPath: '/auth/oauth/github?mode=link',
    icon: Github,
  },
  {
    key: 'google',
    apiProvider: 'google',
    copyKey: 'googleIdentity',
    kind: 'identity',
    connectPath: '/auth/oauth/google?mode=link',
    icon: Chrome,
  },
  {
    key: 'microsoft',
    apiProvider: 'microsoft',
    copyKey: 'microsoftIdentity',
    kind: 'identity',
    icon: Link2,
  },
];

const IDENTITY_PROVIDERS = new Set(['github', 'google', 'microsoft']);
const MAX_IDENTIFIER_LENGTH = 256;

type IntegrationConnection = Readonly<{
  id: string;
  provider: string;
  externalAccountLabel: string;
  status: 'active' | 'needs_reconnect' | 'revoked';
  forAgentUse: boolean;
  revokedAt: string | null;
  createdAt: string;
}>;

type IdentityConnection = Readonly<{
  provider: string;
  externalId: string;
  createdAt: string;
}>;

type ReconnectionAlert = Readonly<{
  id: string;
  userConnectionId: string;
  provider: string;
  externalAccountLabel: string;
  reason: string;
  detectedAt: string;
}>;

type ResourceResult<T> = Readonly<{ value: T; error: LoadErrorKind }>;

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const copy = getAccountSettingsConnectedCopy(data?.language);

  return [
    { title: copy['accountSettingsConnected.meta.title'] },
    { name: 'description', content: copy['accountSettingsConnected.meta.description'] },
  ];
};

export { UserAreaRouteErrorBoundary as ErrorBoundary } from '~/components/dashboard/UserAreaRouteError';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function normalizeIntegrationConnection(value: unknown): IntegrationConnection | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    !nonEmptyString(value.id) ||
    !nonEmptyString(value.provider) ||
    typeof value.externalAccountLabel !== 'string' ||
    (value.status !== 'active' && value.status !== 'needs_reconnect' && value.status !== 'revoked') ||
    typeof value.forAgentUse !== 'boolean' ||
    (value.revokedAt !== null && typeof value.revokedAt !== 'string') ||
    !nonEmptyString(value.createdAt)
  ) {
    return null;
  }

  return {
    id: value.id,
    provider: value.provider,
    externalAccountLabel: value.externalAccountLabel,
    status: value.status,
    forAgentUse: value.forAgentUse,
    revokedAt: value.revokedAt,
    createdAt: value.createdAt,
  };
}

function normalizeIdentityConnection(value: unknown): IdentityConnection | null {
  if (
    !isRecord(value) ||
    !nonEmptyString(value.provider) ||
    !nonEmptyString(value.externalId) ||
    !nonEmptyString(value.createdAt)
  ) {
    return null;
  }

  return { provider: value.provider, externalId: value.externalId, createdAt: value.createdAt };
}

function normalizeReconnectionAlert(value: unknown): ReconnectionAlert | null {
  if (
    !isRecord(value) ||
    !nonEmptyString(value.id) ||
    !nonEmptyString(value.userConnectionId) ||
    !nonEmptyString(value.provider) ||
    typeof value.externalAccountLabel !== 'string' ||
    !nonEmptyString(value.reason) ||
    !nonEmptyString(value.detectedAt)
  ) {
    return null;
  }

  return {
    id: value.id,
    userConnectionId: value.userConnectionId,
    provider: value.provider,
    externalAccountLabel: value.externalAccountLabel,
    reason: value.reason,
    detectedAt: value.detectedAt,
  };
}

function normalizeList<T>(payload: unknown, key: 'connections' | 'alerts', normalize: (value: unknown) => T | null) {
  if (!isRecord(payload) || !Array.isArray(payload[key])) {
    return null;
  }

  const values: T[] = [];

  for (const candidate of payload[key]) {
    const value = normalize(candidate);

    if (!value) {
      return null;
    }

    values.push(value);
  }

  return values;
}

async function loadResource<T>(
  request: Request,
  path: string,
  key: 'connections' | 'alerts',
  normalize: (value: unknown) => T | null,
): Promise<ResourceResult<T[]>> {
  try {
    const payload = await apiRequest<unknown>(request, path);
    const value = normalizeList(payload, key, normalize);

    return value ? { value, error: null } : { value: [], error: 'temporary' };
  } catch (error) {
    if (isReauthRedirect(error)) {
      throw error;
    }

    return {
      value: [],
      error: error instanceof Response && error.status === 403 ? 'permission' : 'temporary',
    };
  }
}

export async function loader({ request }: EnterpriseLoaderArgs) {
  const language = resolveAccountSettingsConnectedLanguage(resolveRequestLocale(request).language);

  const [integration, identity, reconnection] = await Promise.all([
    loadResource(request, '/api/account/connections', 'connections', normalizeIntegrationConnection),
    loadResource(request, '/auth/connections', 'connections', normalizeIdentityConnection),
    loadResource(request, '/api/account/reconnection-alerts', 'alerts', normalizeReconnectionAlert),
  ]);

  return {
    integrationConnections: integration.value,
    identityConnections: identity.value,
    reconnectionAlerts: reconnection.value,
    loadErrors: {
      integration: integration.error,
      identity: identity.error,
      alerts: reconnection.error,
    },
    language,
  };
}

function actionError(errorCode: AccountSettingsConnectedErrorCode, status: number) {
  return json<AccountSettingsConnectedActionData>({ errorCode }, { status });
}

export async function action({ request }: EnterpriseActionArgs) {
  const body = formObject(await request.formData()) as { intent?: string; provider?: string };

  if (body.intent !== 'unlink-identity') {
    return actionError('unsupportedAction', 400);
  }

  const provider = body.provider?.trim().toLowerCase() ?? '';

  if (!provider || provider.length > MAX_IDENTIFIER_LENGTH || !IDENTITY_PROVIDERS.has(provider)) {
    return actionError('invalidProvider', 400);
  }

  try {
    await apiRequest(request, `/auth/connections/${encodeURIComponent(provider)}`, {
      method: 'DELETE',
      redirectOn401: false,
    });

    return json<AccountSettingsConnectedActionData>({ statusCode: 'identityUnlinked' });
  } catch (error) {
    if (isReauthRedirect(error)) {
      throw error;
    }

    return actionError(await resolveConnectedAccountActionError(error), connectedAccountInlineStatus(error));
  }
}

function providerCopy(
  copy: AccountSettingsConnectedCopy,
  provider: ProviderDescriptor,
  field: 'title' | 'detail',
): string {
  return copy[`accountSettingsConnected.provider.${provider.copyKey}.${field}` as AccountSettingsConnectedKey];
}

function formatCopy(template: string, values: Readonly<Record<string, string | number>>) {
  return formatAccountSettingsConnectedCopy(template, values);
}

function providerActionLabel(
  copy: AccountSettingsConnectedCopy,
  key:
    | 'connectAria'
    | 'connectingAria'
    | 'linkAria'
    | 'reconnectAria'
    | 'reconnectingAria'
    | 'dismissAria'
    | 'disconnectAria'
    | 'unlinkAria',
  provider: string,
) {
  return formatCopy(copy[`accountSettingsConnected.action.${key}`], { provider });
}

function validAuthorizationUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 8192) {
    return null;
  }

  try {
    const url = new URL(value);

    if (url.protocol === 'https:') {
      return url.toString();
    }

    const localDevelopmentHost =
      url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';

    return url.protocol === 'http:' && localDevelopmentHost ? url.toString() : null;
  } catch {
    return null;
  }
}

async function startConnectorOauth(
  provider: string,
  actionKind: Extract<AccountSettingsConnectedAction, 'connect' | 'reconnect'>,
): Promise<{ authorizationUrl?: string; errorCode?: AccountSettingsConnectedErrorCode }> {
  let response: Response;

  try {
    response = await fetch(`/api/integrations/oauth/${encodeURIComponent(provider)}/connect`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
  } catch {
    return { errorCode: resolveConnectedAccountClientError(actionKind) };
  }

  if (!response.ok) {
    return { errorCode: resolveConnectedAccountClientError(actionKind, response.status) };
  }

  try {
    const payload = (await response.json()) as unknown;
    const authorizationUrl = isRecord(payload) ? validAuthorizationUrl(payload.authorizationUrl) : null;

    return authorizationUrl ? { authorizationUrl } : { errorCode: 'invalidResponse' };
  } catch {
    return { errorCode: 'invalidResponse' };
  }
}

async function postConnectedAccountAction(
  path: string,
  actionKind: Extract<AccountSettingsConnectedAction, 'dismiss' | 'disconnect'>,
): Promise<AccountSettingsConnectedErrorCode | null> {
  try {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });

    return response.ok ? null : resolveConnectedAccountClientError(actionKind, response.status);
  } catch {
    return resolveConnectedAccountClientError(actionKind);
  }
}

function ResourceLoadState({
  resource,
  error,
  copy,
}: {
  resource: 'integration' | 'identity' | 'alerts';
  error: Exclude<LoadErrorKind, null>;
  copy: AccountSettingsConnectedCopy;
}) {
  const revalidator = useRevalidator();

  if (revalidator.state !== 'idle') {
    return <AsyncPanelSkeleton label={copy[`accountSettingsConnected.load.${resource}.loading`]} rows={2} compact />;
  }

  return (
    <AsyncPanelError
      title={copy[`accountSettingsConnected.load.${resource}.title`]}
      description={
        error === 'permission'
          ? copy['accountSettingsConnected.load.permission.description']
          : copy[`accountSettingsConnected.load.${resource}.description`]
      }
      tone={error === 'permission' ? 'warning' : 'error'}
      onRetry={error === 'temporary' ? () => revalidator.revalidate() : undefined}
      retryLabel={copy['accountSettingsConnected.load.retry']}
      compact
    />
  );
}

export default function ConnectedAccountsPage() {
  const { integrationConnections, identityConnections, reconnectionAlerts, loadErrors, language } =
    useLoaderData<typeof loader>();

  const resolvedLanguage: AccountSettingsConnectedLanguage = resolveAccountSettingsConnectedLanguage(language);
  const copy = getAccountSettingsConnectedCopy(resolvedLanguage);
  const actionData = useActionData<typeof action>() as AccountSettingsConnectedActionData | undefined;
  const [searchParams] = useSearchParams();
  const linked = searchParams.get('linked');
  const linkError = searchParams.get('linkError');
  const linkErrorDetail = searchParams.get('detail');
  const linkedProviderLabel = linked ? connectedAccountProviderLabel(linked, resolvedLanguage) : null;
  const failedProviderLabel = linkError ? connectedAccountProviderLabel(linkError, resolvedLanguage) : null;
  const status = actionData ? formatConnectedAccountStatus(actionData, resolvedLanguage) : undefined;
  const actionErrorMessage = formatConnectedAccountError(actionData?.errorCode, resolvedLanguage);

  const alertsByConnection = new Map<string, ReconnectionAlert>();

  for (const alert of reconnectionAlerts) {
    if (!alertsByConnection.has(alert.userConnectionId)) {
      alertsByConnection.set(alert.userConnectionId, alert);
    }
  }

  const dedupedAlerts = Array.from(alertsByConnection.values());

  const integrationByProvider = new Map(
    integrationConnections
      .filter((connection) => !connection.revokedAt && connection.status !== 'revoked')
      .map((connection) => [connection.provider, connection]),
  );

  const identityByProvider = new Map(identityConnections.map((connection) => [connection.provider, connection]));

  return (
    <section className="min-w-0 space-y-4" aria-labelledby="connected-accounts-heading">
      <div className="min-w-0">
        <h2
          id="connected-accounts-heading"
          className="break-words text-base font-semibold text-bolt-elements-textPrimary"
        >
          {copy['accountSettingsConnected.page.title']}
        </h2>
        <p className="mt-1 min-w-0 break-words text-sm text-bolt-elements-textSecondary">
          {copy['accountSettingsConnected.page.description']}
        </p>
      </div>

      {linkedProviderLabel ? (
        <p
          role="status"
          className="min-w-0 break-words rounded-md border border-[var(--status-success-border)] bg-[var(--status-success-bg)] px-3 py-2 text-sm text-[var(--status-success-text)]"
        >
          {formatCopy(copy['accountSettingsConnected.oauth.linked'], { provider: linkedProviderLabel })}
        </p>
      ) : null}
      {failedProviderLabel ? (
        <p
          role="alert"
          className="min-w-0 break-words rounded-md border border-[var(--status-error-border)] bg-[var(--status-error-bg)] px-3 py-2 text-sm text-[var(--status-error-text)]"
        >
          {formatCopy(copy['accountSettingsConnected.oauth.linkFailed'], {
            provider: failedProviderLabel,
            reason: connectedAccountOauthError(linkErrorDetail, resolvedLanguage),
          })}
        </p>
      ) : null}
      {status ? (
        <p
          role="status"
          className="min-w-0 break-words rounded-md border border-[var(--status-success-border)] bg-[var(--status-success-bg)] px-3 py-2 text-sm text-[var(--status-success-text)]"
        >
          {status}
        </p>
      ) : null}
      {actionErrorMessage ? (
        <p
          role="alert"
          className="min-w-0 break-words rounded-md border border-[var(--status-error-border)] bg-[var(--status-error-bg)] px-3 py-2 text-sm text-[var(--status-error-text)]"
        >
          {actionErrorMessage}
        </p>
      ) : null}

      {loadErrors.alerts ? (
        <ResourceLoadState resource="alerts" error={loadErrors.alerts} copy={copy} />
      ) : dedupedAlerts.length > 0 ? (
        <ReconnectionAlertsBanner alerts={dedupedAlerts} copy={copy} language={resolvedLanguage} />
      ) : null}

      {loadErrors.integration ? (
        <ResourceLoadState resource="integration" error={loadErrors.integration} copy={copy} />
      ) : null}
      {loadErrors.identity ? <ResourceLoadState resource="identity" error={loadErrors.identity} copy={copy} /> : null}

      <ul className="min-w-0 overflow-hidden rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-sm">
        {PROVIDERS.map((provider, index) => {
          const Icon = provider.icon;
          const providerLabel = providerCopy(copy, provider, 'title');

          const integration =
            provider.kind === 'integration' ? integrationByProvider.get(provider.apiProvider) : undefined;

          const identity = provider.kind === 'identity' ? identityByProvider.get(provider.apiProvider) : undefined;
          const unavailable = Boolean(loadErrors[provider.kind]);
          const needsReconnect = !unavailable && integration?.status === 'needs_reconnect';

          const isConnected =
            !unavailable && (Boolean(integration && integration.status === 'active') || Boolean(identity));

          const createdAt = integration?.createdAt ?? identity?.createdAt ?? null;
          const connectedSince = createdAt ? formatConnectedAccountDate(createdAt, resolvedLanguage) : null;

          const statusLabel = unavailable
            ? copy['accountSettingsConnected.status.unavailable']
            : needsReconnect
              ? copy['accountSettingsConnected.status.needsReconnect']
              : isConnected
                ? copy['accountSettingsConnected.status.connected']
                : copy['accountSettingsConnected.status.notConnected'];

          return (
            <li
              key={provider.key}
              className={classNames(
                'flex min-w-0 flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between',
                index > 0 && 'border-t border-bolt-elements-borderColor',
              )}
            >
              <div className="flex min-w-0 items-start gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-bolt-elements-background-depth-3">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0">
                  <h3 className="break-words text-sm font-semibold text-bolt-elements-textPrimary">{providerLabel}</h3>
                  <p className="mt-1 min-w-0 break-words text-sm text-bolt-elements-textSecondary">
                    {providerCopy(copy, provider, 'detail')}
                  </p>
                  {integration?.externalAccountLabel ? (
                    <p dir="auto" className="mt-1 min-w-0 break-all text-xs text-bolt-elements-textTertiary">
                      {formatCopy(copy['accountSettingsConnected.connection.account'], {
                        account: integration.externalAccountLabel,
                      })}
                    </p>
                  ) : null}
                  {connectedSince ? (
                    <p className="mt-1 min-w-0 break-words text-xs text-bolt-elements-textTertiary">
                      {formatCopy(copy['accountSettingsConnected.connection.linkedSince'], {
                        date: connectedSince,
                      })}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="flex w-full min-w-0 flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-center lg:w-auto lg:shrink-0 lg:justify-end">
                <StatusPill label={statusLabel} tone={isConnected ? 'success' : needsReconnect ? 'info' : 'neutral'} />
                {!unavailable && provider.kind === 'integration' && (!isConnected || needsReconnect) ? (
                  <IntegrationConnectButton
                    provider={provider.apiProvider}
                    providerLabel={providerLabel}
                    actionKind={needsReconnect ? 'reconnect' : 'connect'}
                    copy={copy}
                    language={resolvedLanguage}
                  />
                ) : !unavailable && !isConnected && provider.connectPath ? (
                  <Link
                    to={provider.connectPath}
                    reloadDocument
                    aria-label={providerActionLabel(copy, 'linkAria', providerLabel)}
                    className="inline-flex min-h-[44px] max-w-full items-center justify-center rounded-md border border-bolt-elements-borderColor px-3 py-2 text-center text-xs font-medium text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)]"
                  >
                    <span className="min-w-0 break-words">{copy['accountSettingsConnected.action.link']}</span>
                  </Link>
                ) : !unavailable && isConnected && provider.kind === 'integration' && integration ? (
                  <IntegrationDisconnectButton
                    connectionId={integration.id}
                    providerLabel={providerLabel}
                    copy={copy}
                    language={resolvedLanguage}
                  />
                ) : !unavailable && isConnected && provider.kind === 'identity' ? (
                  <IdentityUnlinkButton provider={provider.apiProvider} providerLabel={providerLabel} copy={copy} />
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ReconnectionAlertsBanner({
  alerts,
  copy,
  language,
}: {
  alerts: ReconnectionAlert[];
  copy: AccountSettingsConnectedCopy;
  language: AccountSettingsConnectedLanguage;
}) {
  return (
    <section
      role="alert"
      aria-labelledby="connection-reconnect-alert-heading"
      className="min-w-0 rounded-lg border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] p-4 text-bolt-elements-textPrimary shadow-sm"
    >
      <div className="flex min-w-0 items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--status-warning-text)]" aria-hidden />
        <div className="min-w-0 flex-1">
          <h3 id="connection-reconnect-alert-heading" className="break-words text-sm font-semibold">
            {formatReconnectionAlertCount(alerts.length, language)}
          </h3>
          <ul className="mt-3 flex min-w-0 flex-col gap-4">
            {alerts.map((alert) => (
              <ReconnectionAlertRow key={alert.id} alert={alert} copy={copy} language={language} />
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function ReconnectionAlertRow({
  alert,
  copy,
  language,
}: {
  alert: ReconnectionAlert;
  copy: AccountSettingsConnectedCopy;
  language: AccountSettingsConnectedLanguage;
}) {
  const { state, launch, reset } = useConnectorPopup();
  const revalidator = useRevalidator();
  const [errorCode, setErrorCode] = useState<AccountSettingsConnectedErrorCode | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [dismissing, setDismissing] = useState(false);

  useEffect(() => {
    if (state.phase === 'succeeded') {
      revalidator.revalidate();
      reset();
    } else if (state.phase === 'failed') {
      setErrorCode(resolveConnectedAccountPopupError(state.result.errorCode));
      reset();
    }
  }, [state, revalidator, reset]);

  const reconnect = useCallback(async () => {
    setErrorCode(null);
    setReconnecting(true);

    const result = await startConnectorOauth(alert.provider, 'reconnect');

    if (result.authorizationUrl) {
      launch({ authorizationUrl: result.authorizationUrl, provider: alert.provider });
    } else {
      setErrorCode(result.errorCode ?? 'reconnectFailed');
    }

    setReconnecting(false);
  }, [alert.provider, launch]);

  const dismiss = useCallback(async () => {
    setErrorCode(null);
    setDismissing(true);

    const nextError = await postConnectedAccountAction(
      `/api/account/reconnection-alerts/${encodeURIComponent(alert.id)}/resolve`,
      'dismiss',
    );

    if (nextError) {
      setErrorCode(nextError);
    } else {
      revalidator.revalidate();
    }

    setDismissing(false);
  }, [alert.id, revalidator]);

  const reconnectBusy = reconnecting || state.phase === 'launching';
  const providerLabel = connectedAccountProviderLabel(alert.provider, language);
  const error = formatConnectedAccountError(errorCode ?? undefined, language);
  const reconnectAria = providerActionLabel(copy, reconnectBusy ? 'reconnectingAria' : 'reconnectAria', providerLabel);

  return (
    <li className="flex min-w-0 flex-col gap-3 border-t border-[var(--status-warning-border)] pt-3 first:border-t-0 first:pt-0 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <p className="min-w-0 break-words text-sm text-bolt-elements-textSecondary">
          <span className="font-medium text-bolt-elements-textPrimary">{providerLabel}</span>
          {alert.externalAccountLabel ? (
            <span dir="auto" className="break-all">
              {' '}
              ({alert.externalAccountLabel})
            </span>
          ) : null}{' '}
          — {connectedAccountReconnectReason(alert.reason, language)}.
        </p>
        <p className="mt-1 break-words text-xs text-bolt-elements-textTertiary">
          {formatCopy(copy['accountSettingsConnected.alert.detected'], {
            date: formatConnectedAccountDate(alert.detectedAt, language),
          })}
        </p>
        {error ? (
          <p role="alert" className="mt-1 min-w-0 break-words text-xs text-[var(--status-error-text)]">
            {error}
          </p>
        ) : null}
      </div>
      <div className="grid min-w-0 shrink-0 grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => void reconnect()}
          disabled={reconnectBusy || dismissing}
          aria-busy={reconnectBusy}
          aria-label={reconnectAria}
          className="inline-flex min-h-[44px] max-w-full items-center justify-center rounded-md bg-bolt-elements-button-primary-background px-3 py-2 text-center text-xs font-medium text-bolt-elements-button-primary-text hover:bg-bolt-elements-button-primary-backgroundHover focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)] disabled:opacity-60"
        >
          <span className="min-w-0 break-words">
            {reconnectBusy
              ? copy['accountSettingsConnected.action.reconnecting']
              : copy['accountSettingsConnected.action.reconnect']}
          </span>
        </button>
        <button
          type="button"
          onClick={() => void dismiss()}
          disabled={dismissing || reconnectBusy}
          aria-busy={dismissing}
          aria-label={providerActionLabel(copy, 'dismissAria', providerLabel)}
          className="inline-flex min-h-[44px] max-w-full items-center justify-center rounded-md border border-bolt-elements-borderColor px-3 py-2 text-center text-xs font-medium text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)] disabled:opacity-60"
        >
          <span className="min-w-0 break-words">
            {dismissing
              ? copy['accountSettingsConnected.action.dismissing']
              : copy['accountSettingsConnected.action.dismiss']}
          </span>
        </button>
      </div>
    </li>
  );
}

function IntegrationConnectButton({
  provider,
  providerLabel,
  actionKind,
  copy,
  language,
}: {
  provider: string;
  providerLabel: string;
  actionKind: 'connect' | 'reconnect';
  copy: AccountSettingsConnectedCopy;
  language: AccountSettingsConnectedLanguage;
}) {
  const { state, launch, reset } = useConnectorPopup();
  const revalidator = useRevalidator();
  const [errorCode, setErrorCode] = useState<AccountSettingsConnectedErrorCode | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (state.phase === 'succeeded') {
      revalidator.revalidate();
      reset();
    } else if (state.phase === 'failed') {
      setErrorCode(resolveConnectedAccountPopupError(state.result.errorCode));
      reset();
    }
  }, [state, revalidator, reset]);

  const start = useCallback(async () => {
    setErrorCode(null);
    setStarting(true);

    const result = await startConnectorOauth(provider, actionKind);

    if (result.authorizationUrl) {
      launch({ authorizationUrl: result.authorizationUrl, provider });
    } else {
      setErrorCode(result.errorCode ?? (actionKind === 'connect' ? 'connectFailed' : 'reconnectFailed'));
    }

    setStarting(false);
  }, [actionKind, launch, provider]);

  const busy = starting || state.phase === 'launching';
  const error = formatConnectedAccountError(errorCode ?? undefined, language);
  const labelKey = actionKind === 'connect' ? 'connect' : 'reconnect';

  const ariaKey =
    actionKind === 'connect' ? (busy ? 'connectingAria' : 'connectAria') : busy ? 'reconnectingAria' : 'reconnectAria';

  return (
    <div className="flex min-w-0 flex-col items-stretch gap-1 sm:items-end">
      <button
        type="button"
        onClick={() => void start()}
        disabled={busy}
        aria-busy={busy}
        aria-label={providerActionLabel(copy, ariaKey, providerLabel)}
        className="inline-flex min-h-[44px] max-w-full items-center justify-center rounded-md border border-bolt-elements-borderColor px-3 py-2 text-center text-xs font-medium text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)] disabled:opacity-60"
      >
        <span className="min-w-0 break-words">
          {busy
            ? copy[`accountSettingsConnected.action.${labelKey === 'connect' ? 'connecting' : 'reconnecting'}`]
            : copy[`accountSettingsConnected.action.${labelKey}`]}
        </span>
      </button>
      {error ? (
        <p
          role="alert"
          className="max-w-64 min-w-0 break-words text-left text-xs text-[var(--status-error-text)] sm:text-right"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

function IntegrationDisconnectButton({
  connectionId,
  providerLabel,
  copy,
  language,
}: {
  connectionId: string;
  providerLabel: string;
  copy: AccountSettingsConnectedCopy;
  language: AccountSettingsConnectedLanguage;
}) {
  const revalidator = useRevalidator();
  const [errorCode, setErrorCode] = useState<AccountSettingsConnectedErrorCode | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const disconnect = useCallback(async () => {
    setErrorCode(null);
    setBusy(true);

    const nextError = await postConnectedAccountAction(
      `/api/account/connections/${encodeURIComponent(connectionId)}/revoke`,
      'disconnect',
    );

    if (nextError) {
      setErrorCode(nextError);
    } else {
      revalidator.revalidate();
    }

    setBusy(false);
  }, [connectionId, revalidator]);

  const error = formatConnectedAccountError(errorCode ?? undefined, language);

  return (
    <div className="flex min-w-0 flex-col items-stretch gap-1 sm:items-end">
      <ConfirmationDialog
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          void disconnect();
        }}
        title={formatCopy(copy['accountSettingsConnected.dialog.disconnect.title'], { provider: providerLabel })}
        description={copy['accountSettingsConnected.dialog.disconnect.description']}
        confirmLabel={copy['accountSettingsConnected.dialog.disconnect.confirm']}
        cancelLabel={copy['accountSettingsConnected.dialog.cancel']}
        variant="destructive"
        isLoading={busy}
      />
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        disabled={busy}
        aria-busy={busy}
        aria-label={providerActionLabel(copy, 'disconnectAria', providerLabel)}
        className="inline-flex min-h-[44px] max-w-full items-center justify-center rounded-md border border-bolt-elements-borderColor px-3 py-2 text-center text-xs font-medium text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)] disabled:opacity-60"
      >
        <span className="min-w-0 break-words">
          {busy
            ? copy['accountSettingsConnected.action.disconnecting']
            : copy['accountSettingsConnected.action.disconnect']}
        </span>
      </button>
      {error ? (
        <p
          role="alert"
          className="max-w-64 min-w-0 break-words text-left text-xs text-[var(--status-error-text)] sm:text-right"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

function IdentityUnlinkButton({
  provider,
  providerLabel,
  copy,
}: {
  provider: string;
  providerLabel: string;
  copy: AccountSettingsConnectedCopy;
}) {
  const navigation = useNavigation();
  const submit = useSubmit();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const busy = navigation.state !== 'idle' && navigation.formData?.get('provider') === provider;

  return (
    <Form
      method="post"
      className="min-w-0"
      onSubmit={(event) => {
        event.preventDefault();
        setConfirmOpen(true);
      }}
    >
      <input type="hidden" name="intent" value="unlink-identity" />
      <input type="hidden" name="provider" value={provider} />
      <ConfirmationDialog
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          submit({ intent: 'unlink-identity', provider }, { method: 'post' });
        }}
        title={formatCopy(copy['accountSettingsConnected.dialog.unlink.title'], { provider: providerLabel })}
        description={copy['accountSettingsConnected.dialog.unlink.description']}
        confirmLabel={copy['accountSettingsConnected.dialog.unlink.confirm']}
        cancelLabel={copy['accountSettingsConnected.dialog.cancel']}
        variant="destructive"
        isLoading={busy}
      />
      <button
        type="submit"
        disabled={busy}
        aria-busy={busy}
        aria-label={providerActionLabel(copy, 'unlinkAria', providerLabel)}
        className="inline-flex min-h-[44px] w-full max-w-full items-center justify-center rounded-md border border-bolt-elements-borderColor px-3 py-2 text-center text-xs font-medium text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)] disabled:opacity-60 sm:w-auto"
      >
        <span className="min-w-0 break-words">
          {busy ? copy['accountSettingsConnected.action.unlinking'] : copy['accountSettingsConnected.action.unlink']}
        </span>
      </button>
    </Form>
  );
}
