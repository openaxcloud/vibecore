import { AlertTriangle, ArrowLeft, CheckCircle2, FileSearch, Link2, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MetaFunction } from 'react-router';
import { Form, Link, useActionData, useLoaderData, useNavigation, useRevalidator } from 'react-router';
import { ConnectorApiKeyConnectButton } from '~/components/@settings/shared/connectors/ConnectorApiKeyConnectButton';
import { AsyncPanelError } from '~/components/dashboard/AsyncPanelState';
import { AppShell } from '~/components/dashboard/SaaSLayout';
import { Button } from '~/components/ui/Button';
import {
  apiRequest,
  firstOrganization,
  firstOrganizationOrNull,
  isApiResponse,
  json,
  redirect,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import {
  formatImportHubCopy,
  getImportHubCopy,
  type ImportHubCredentialProviderId,
  type ImportHubKey,
} from '~/lib/i18n/catalogs/import-hub';
import { localeResponseHeaders, resolveRequestLocale } from '~/lib/i18n/request-locale';
import { getImportHubProvider } from '~/lib/import-hub';
import { isReauthRedirect } from '~/lib/route-reauth';
import { projectIdePath } from '~/utils/project-url';

const CREDENTIAL_PROVIDERS = new Set<ImportHubCredentialProviderId>(['vercel', 'figma', 'claude']);

const CREDENTIAL_HELP_URLS: Record<ImportHubCredentialProviderId, string> = {
  vercel: 'https://vercel.com/account/tokens',
  figma: 'https://www.figma.com/developers/api#access-tokens',
  claude: 'https://console.anthropic.com/settings/keys',
};

type ConnectionStatus = 'active' | 'needs_reconnect' | 'revoked';

type Connection = {
  id: string;
  externalAccountLabel: string;
  status: ConnectionStatus;
};

type PreviewFactKey =
  | 'framework'
  | 'repository'
  | 'updatedAt'
  | 'pages'
  | 'components'
  | 'componentSets'
  | 'version'
  | 'sourceFormat'
  | 'sourceLines'
  | 'sourceCharacters'
  | 'verifiedModel';

type PreviewWarning = 'vercelConfigurationOnly' | 'figmaDocumentSnapshot' | 'claudeExactSource';

type ImportPreview = {
  provider: ImportHubCredentialProviderId;
  title: string;
  sourceRef: string;
  fileCount: number;
  byteCount: number;
  facts: Array<{ key: PreviewFactKey; value: string }>;
  warnings: PreviewWarning[];
  paths: string[];
};

type ImportFinding = {
  path: string;
  line: number;
  kind: string;
  preview: string;
};

type ImportReview = {
  importJobId: string;
  state: string;
  preview: ImportPreview;
  findings: ImportFinding[];
  requiresConsent: boolean;
};

type ImportProviderErrorCode =
  | 'notConnected'
  | 'credentialExpired'
  | 'credentialUnavailable'
  | 'connectorDisabled'
  | 'sourceRequired'
  | 'sourceInvalid'
  | 'sourceNotFound'
  | 'sourceForbidden'
  | 'upstreamUnavailable'
  | 'responseInvalid'
  | 'sourceTooLarge'
  | 'previewFailed'
  | 'consentRequired'
  | 'commitFailed'
  | 'cancelFailed'
  | 'quota';

type ActionData =
  | ({ stage: 'preview'; errorCode?: ImportProviderErrorCode } & ImportReview)
  | { stage: 'error'; errorCode: ImportProviderErrorCode; nextAttemptId: string };

function isCredentialProvider(provider: string): provider is ImportHubCredentialProviderId {
  return CREDENTIAL_PROVIDERS.has(provider as ImportHubCredentialProviderId);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cleanString(value: unknown, maxLength = 500): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value.slice(0, maxLength) : undefined;
}

function normalizeConnection(value: unknown): Connection | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const id = cleanString(value.id, 200);
  const externalAccountLabel = cleanString(value.externalAccountLabel, 200);
  const status = value.status;

  if (!id || !externalAccountLabel || (status !== 'active' && status !== 'needs_reconnect' && status !== 'revoked')) {
    return undefined;
  }

  return { id, externalAccountLabel, status };
}

const FACT_KEYS = new Set<PreviewFactKey>([
  'framework',
  'repository',
  'updatedAt',
  'pages',
  'components',
  'componentSets',
  'version',
  'sourceFormat',
  'sourceLines',
  'sourceCharacters',
  'verifiedModel',
]);

const WARNING_CODES = new Set<PreviewWarning>([
  'vercelConfigurationOnly',
  'figmaDocumentSnapshot',
  'claudeExactSource',
]);

function normalizePreview(value: unknown, expectedProvider: ImportHubCredentialProviderId): ImportPreview | undefined {
  if (!isRecord(value) || value.provider !== expectedProvider) {
    return undefined;
  }

  const title = cleanString(value.title, 160);
  const sourceRef = cleanString(value.sourceRef, 500);
  const fileCount = typeof value.fileCount === 'number' ? value.fileCount : Number.NaN;
  const byteCount = typeof value.byteCount === 'number' ? value.byteCount : Number.NaN;

  if (!title || !sourceRef || !Number.isSafeInteger(fileCount) || !Number.isSafeInteger(byteCount)) {
    return undefined;
  }

  const facts = Array.isArray(value.facts)
    ? value.facts.flatMap((fact) => {
        if (!isRecord(fact) || !FACT_KEYS.has(fact.key as PreviewFactKey)) {
          return [];
        }

        const factValue = cleanString(fact.value, 500);

        return factValue ? [{ key: fact.key as PreviewFactKey, value: factValue }] : [];
      })
    : [];
  const warnings = Array.isArray(value.warnings)
    ? value.warnings.filter((warning): warning is PreviewWarning => WARNING_CODES.has(warning as PreviewWarning))
    : [];
  const paths = Array.isArray(value.paths)
    ? value.paths.flatMap((path) => {
        const normalized = cleanString(path, 500);
        return normalized ? [normalized] : [];
      })
    : [];

  if (paths.length !== fileCount || fileCount < 1 || byteCount < 0) {
    return undefined;
  }

  return {
    provider: expectedProvider,
    title,
    sourceRef,
    fileCount,
    byteCount,
    facts,
    warnings,
    paths,
  };
}

function normalizeReview(value: unknown, expectedProvider: ImportHubCredentialProviderId): ImportReview | undefined {
  const container = isRecord(value) && isRecord(value.import) ? value.import : undefined;

  if (!container) {
    return undefined;
  }

  const importJobId = cleanString(container.importJobId ?? container.id, 200);
  const state = cleanString(container.state, 80);
  const preview = normalizePreview(container.preview, expectedProvider);

  if (!importJobId || !state || !preview) {
    return undefined;
  }

  const findings = Array.isArray(container.findings)
    ? container.findings.flatMap((finding) => {
        if (!isRecord(finding)) {
          return [];
        }

        const path = cleanString(finding.path, 500);
        const kind = cleanString(finding.kind, 100);
        const findingPreview = cleanString(finding.preview, 500);
        const line = finding.line;

        if (!path || !kind || !findingPreview || !Number.isSafeInteger(line) || Number(line) < 1) {
          return [];
        }

        return [{ path, kind, preview: findingPreview, line: Number(line) }];
      })
    : [];

  return {
    importJobId,
    state,
    preview,
    findings,
    requiresConsent: container.requiresConsent === true || findings.length > 0,
  };
}

async function responseCode(error: unknown): Promise<string | undefined> {
  if (!(error instanceof Response)) {
    return undefined;
  }

  try {
    const body = (await error.clone().json()) as unknown;
    return isRecord(body) ? cleanString(body.code, 120) : undefined;
  } catch {
    return undefined;
  }
}

async function classifyActionError(
  error: unknown,
  fallback: 'previewFailed' | 'commitFailed' | 'cancelFailed',
): Promise<ImportProviderErrorCode> {
  const code = await responseCode(error);

  const mapping: Readonly<Record<string, ImportProviderErrorCode>> = {
    IMPORT_CONNECTOR_NOT_LINKED: 'notConnected',
    IMPORT_CONNECTOR_CREDENTIAL_EXPIRED: 'credentialExpired',
    IMPORT_CONNECTOR_CREDENTIAL_UNAVAILABLE: 'credentialUnavailable',
    CONNECTOR_DISABLED: 'connectorDisabled',
    IMPORT_CONNECTOR_SOURCE_REQUIRED: 'sourceRequired',
    IMPORT_CONNECTOR_SOURCE_INVALID: 'sourceInvalid',
    VALIDATION_ERROR: 'sourceInvalid',
    IMPORT_CONNECTOR_SOURCE_NOT_FOUND: 'sourceNotFound',
    IMPORT_CONNECTOR_SOURCE_FORBIDDEN: 'sourceForbidden',
    IMPORT_CONNECTOR_CREDENTIAL_REJECTED: 'credentialExpired',
    IMPORT_CONNECTOR_UPSTREAM_UNAVAILABLE: 'upstreamUnavailable',
    IMPORT_CONNECTOR_RESPONSE_INVALID: 'responseInvalid',
    IMPORT_CONNECTOR_SOURCE_TOO_LARGE: 'sourceTooLarge',
    IMPORT_UNRESOLVED_FINDINGS: 'consentRequired',
    IMPORT_RESCAN_STILL_BLOCKED: 'consentRequired',
  };

  if (code && mapping[code]) {
    return mapping[code];
  }

  if (isApiResponse(error, 402) || isApiResponse(error, 429)) {
    return 'quota';
  }

  return fallback;
}

function newAttemptId(): string {
  return globalThis.crypto.randomUUID();
}

export async function loader({ params, request }: EnterpriseLoaderArgs) {
  const provider = params.provider ?? '';

  if (!isCredentialProvider(provider)) {
    throw new Response(null, { status: 404 });
  }

  const localeResolution = resolveRequestLocale(request);
  const providerMetadata = getImportHubProvider(provider, localeResolution.language);

  try {
    const organization = await firstOrganizationOrNull(request);

    if (!organization) {
      return redirect('/');
    }

    const result = await apiRequest<{ connections?: unknown[] }>(
      request,
      `/api/account/connections?provider=${encodeURIComponent(provider)}`,
    );
    const connections = Array.isArray(result.connections)
      ? result.connections
          .map(normalizeConnection)
          .filter((connection): connection is Connection => Boolean(connection))
      : [];

    const connection = connections.find((item) => item.status === 'active') ?? connections[0] ?? null;

    return json(
      {
        provider,
        language: localeResolution.language,
        label: providerMetadata?.label ?? provider,
        organizationId: organization.id,
        organizationSlug: organization.slug,
        connection,
        loadError: false as const,
        attemptId: newAttemptId(),
      },
      { headers: localeResponseHeaders(request, localeResolution) },
    );
  } catch (error) {
    if (isReauthRedirect(error) || (error instanceof Response && error.status >= 300 && error.status < 400)) {
      throw error;
    }

    return json(
      {
        provider,
        language: localeResolution.language,
        label: providerMetadata?.label ?? provider,
        organizationId: null,
        organizationSlug: null,
        connection: null,
        loadError: true as const,
        attemptId: newAttemptId(),
      },
      { status: 503, headers: localeResponseHeaders(request, localeResolution) },
    );
  }
}

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const copy = getImportHubCopy(data?.language);
  const provider = data?.provider;
  const label = data?.label;
  const canonical = provider ? `https://e-code.ai/import/${provider}` : 'https://e-code.ai/import';

  const title = label
    ? formatImportHubCopy(copy['importHub.credential.metaTitle'], { label })
    : copy['importHub.credential.metaFallback'];

  return [
    { title },
    { property: 'og:title', content: title },
    { property: 'og:url', content: canonical },
    { tagName: 'link', rel: 'canonical', href: canonical },
    { tagName: 'link', rel: 'alternate', hrefLang: 'en', href: `${canonical}?lang=en` },
    { tagName: 'link', rel: 'alternate', hrefLang: 'fr', href: `${canonical}?lang=fr` },
    { tagName: 'link', rel: 'alternate', hrefLang: 'x-default', href: canonical },
  ];
};

async function loadReview(
  request: Request,
  organizationId: string,
  importJobId: string,
  provider: ImportHubCredentialProviderId,
): Promise<ImportReview | undefined> {
  try {
    const result = await apiRequest<unknown>(
      request,
      `/orgs/${encodeURIComponent(organizationId)}/imports/${encodeURIComponent(importJobId)}`,
    );

    return normalizeReview(result, provider);
  } catch {
    return undefined;
  }
}

export async function action({ params, request }: EnterpriseActionArgs) {
  const provider = params.provider ?? '';

  if (!isCredentialProvider(provider)) {
    throw new Response(null, { status: 404 });
  }

  const localeResolution = resolveRequestLocale(request);

  const actionResponse = (data: ActionData, status = 200) =>
    json<ActionData>(data, { status, headers: localeResponseHeaders(request, localeResolution) });

  const formData = await request.formData();
  const intent = String(formData.get('intent') ?? 'stage');
  const organization = await firstOrganization(request);

  if (intent === 'cancel') {
    const importJobId = String(formData.get('importJobId') ?? '').trim();

    if (!importJobId) {
      return actionResponse({ stage: 'error', errorCode: 'cancelFailed', nextAttemptId: newAttemptId() }, 400);
    }

    try {
      await apiRequest(request, `/orgs/${organization.id}/imports/${encodeURIComponent(importJobId)}/cancel`, {
        method: 'POST',
      });

      return redirect(`/import/${provider}`);
    } catch (error) {
      if (isReauthRedirect(error) || (error instanceof Response && error.status === 401)) {
        throw error;
      }

      const [errorCode, review] = await Promise.all([
        classifyActionError(error, 'cancelFailed'),
        loadReview(request, organization.id, importJobId, provider),
      ]);

      return review
        ? actionResponse({ stage: 'preview', ...review, errorCode }, error instanceof Response ? error.status : 500)
        : actionResponse(
            { stage: 'error', errorCode, nextAttemptId: newAttemptId() },
            error instanceof Response ? error.status : 500,
          );
    }
  }

  if (intent === 'commit') {
    const importJobId = String(formData.get('importJobId') ?? '').trim();
    const consent: Record<string, 'keep' | 'redact'> = {};

    for (const [key, value] of formData.entries()) {
      if (key.startsWith('consent:') && (value === 'keep' || value === 'redact')) {
        consent[key.slice('consent:'.length)] = value;
      }
    }

    if (!importJobId) {
      return actionResponse({ stage: 'error', errorCode: 'commitFailed', nextAttemptId: newAttemptId() }, 400);
    }

    try {
      const result = await apiRequest<{ project?: { id?: string; slug?: string } }>(
        request,
        `/orgs/${organization.id}/imports/${encodeURIComponent(importJobId)}/commit`,
        { method: 'POST', body: JSON.stringify({ consent }) },
      );

      const projectId = cleanString(result.project?.id, 200);

      if (!projectId) {
        throw new Response(null, { status: 502 });
      }

      return redirect(
        projectIdePath({
          id: projectId,
          slug: cleanString(result.project?.slug, 200),
          organizationSlug: organization.slug,
        }),
      );
    } catch (error) {
      if (isReauthRedirect(error) || (error instanceof Response && error.status === 401)) {
        throw error;
      }

      const [errorCode, review] = await Promise.all([
        classifyActionError(error, 'commitFailed'),
        loadReview(request, organization.id, importJobId, provider),
      ]);

      return review
        ? actionResponse({ stage: 'preview', ...review, errorCode }, error instanceof Response ? error.status : 500)
        : actionResponse(
            { stage: 'error', errorCode, nextAttemptId: newAttemptId() },
            error instanceof Response ? error.status : 500,
          );
    }
  }

  const sourceRef = String(formData.get('sourceRef') ?? '').trim();
  const scopeRef = String(formData.get('scopeRef') ?? '').trim() || undefined;
  const sourcePayload = String(formData.get('sourcePayload') ?? '');
  const targetPath = String(formData.get('targetPath') ?? '').trim() || undefined;
  const idempotencyKey = String(formData.get('idempotencyKey') ?? '').trim() || newAttemptId();

  try {
    const result = await apiRequest<unknown>(request, `/orgs/${organization.id}/imports`, {
      method: 'POST',
      body: JSON.stringify({
        provider,
        sourceRef,
        scopeRef,
        sourcePayload: provider === 'claude' ? sourcePayload : undefined,
        targetPath: provider === 'claude' ? targetPath : undefined,
        idempotencyKey,
        files: [],
      }),
    });

    const review = normalizeReview(result, provider);

    if (!review) {
      return actionResponse({ stage: 'error', errorCode: 'responseInvalid', nextAttemptId: newAttemptId() }, 502);
    }

    return actionResponse({ stage: 'preview', ...review }, 201);
  } catch (error) {
    if (isReauthRedirect(error) || (error instanceof Response && error.status === 401)) {
      throw error;
    }

    return actionResponse(
      {
        stage: 'error',
        errorCode: await classifyActionError(error, 'previewFailed'),
        nextAttemptId: newAttemptId(),
      },
      error instanceof Response ? error.status : 500,
    );
  }
}

function ErrorNotice({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="mb-4 break-words rounded-lg border border-[var(--status-error)]/40 bg-[var(--status-error)]/10 px-3 py-2 text-sm leading-6 text-[var(--status-error-text)]"
    >
      {message}
    </p>
  );
}

function BusyProgress({ label }: { label: string }) {
  return (
    <div
      className="mt-3 h-1 w-full overflow-hidden rounded-full bg-bolt-elements-background-depth-1"
      role="progressbar"
      aria-label={label}
    >
      <div className="h-full w-full animate-pulse rounded-full bg-[var(--vc-ide-accent-action)] motion-reduce:animate-none" />
    </div>
  );
}

export default function ImportCredentialProviderPage() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as ActionData | undefined;
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const { i18n } = useTranslation();
  const copy = getImportHubCopy(i18n.resolvedLanguage ?? i18n.language);

  const [connectedAccount, setConnectedAccount] = useState<string | null>(
    loaderData.connection?.status === 'active' ? loaderData.connection.externalAccountLabel : null,
  );

  const provider = loaderData.provider;
  const label = loaderData.label;

  const text = (template: string, values: Readonly<Record<string, string | number>> = {}) =>
    formatImportHubCopy(template, values);

  const intent = navigation.formData?.get('intent');
  const previewing = navigation.state === 'submitting' && intent === 'stage';
  const committing = navigation.state === 'submitting' && intent === 'commit';
  const cancelling = navigation.state === 'submitting' && intent === 'cancel';
  const activeConnection = Boolean(connectedAccount);
  const review = actionData?.stage === 'preview' ? actionData : undefined;
  const sourceError = actionData?.stage === 'error' ? actionData.errorCode : undefined;
  const attemptId = actionData?.stage === 'error' ? actionData.nextAttemptId : loaderData.attemptId;
  const errorCopy = (code: ImportProviderErrorCode) => copy[`importHub.credential.error.${code}` as ImportHubKey];

  const bytes = new Intl.NumberFormat(i18n.resolvedLanguage ?? i18n.language, {
    style: 'unit',
    unit: 'kilobyte',
    maximumFractionDigits: 1,
  }).format((review?.preview.byteCount ?? 0) / 1024);

  return (
    <AppShell
      title={text(copy['importHub.credential.title'], { label })}
      description={text(copy['importHub.credential.description'], { label })}
    >
      <div className="flex w-full min-w-0 max-w-4xl flex-col gap-4 overflow-x-hidden">
        <Link
          to="/import"
          className="inline-flex min-h-11 w-fit max-w-full items-center gap-1.5 rounded px-1 text-sm font-medium text-[var(--vc-ide-accent-action)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)]"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
          <span className="break-words">{copy['importHub.credential.back']}</span>
        </Link>

        {loaderData.loadError ? (
          <AsyncPanelError
            title={copy['importHub.error.title']}
            description={copy['importHub.credential.error.load']}
            retryLabel={copy['importHub.credential.error.retry']}
            retrying={revalidator.state !== 'idle'}
            onRetry={() => revalidator.revalidate()}
          />
        ) : (
          <>
            <section className="min-w-0 rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 sm:p-6">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-bolt-elements-background-depth-1">
                  <Link2 className="h-5 w-5 text-bolt-elements-textSecondary" aria-hidden />
                </span>
                <div className="min-w-0">
                  <h2 className="break-words text-base font-semibold text-bolt-elements-textPrimary">
                    {copy['importHub.credential.connection.title']}
                  </h2>
                  <p className="mt-1 break-words text-sm leading-6 text-bolt-elements-textSecondary">
                    {text(copy['importHub.credential.connection.description'], { label })}
                  </p>
                </div>
              </div>

              {activeConnection ? (
                <div
                  className="mt-4 flex min-w-0 items-center gap-2 rounded-lg border border-[var(--status-success)]/40 bg-[var(--status-success)]/10 px-3 py-2 text-sm text-bolt-elements-textPrimary"
                  role="status"
                  aria-live="polite"
                >
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--status-success)]" aria-hidden />
                  <span className="min-w-0 break-words">
                    {text(copy['importHub.credential.connection.connected'], { account: connectedAccount ?? label })}
                  </span>
                </div>
              ) : loaderData.connection?.status === 'needs_reconnect' ? (
                <p className="mt-4 text-sm text-[var(--status-warning-text)]" role="status">
                  {copy['importHub.credential.connection.reconnect']}
                </p>
              ) : (
                <p className="mt-4 text-sm text-bolt-elements-textTertiary" role="status">
                  {text(copy['importHub.credential.connection.required'], { label })}
                </p>
              )}

              <ConnectorApiKeyConnectButton
                provider={provider}
                displayName={label}
                tokenLabel={copy[`importHub.credential.connection.token.${provider}`]}
                helpUrl={CREDENTIAL_HELP_URLS[provider]}
                helpLabel={text(copy['importHub.credential.connection.help'], { label })}
                className="mt-4"
                onConnected={({ accountLabel }) => setConnectedAccount(accountLabel)}
              />
            </section>

            {!review ? (
              <section className="min-w-0 rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 sm:p-6">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-bolt-elements-background-depth-1">
                    <FileSearch className="h-5 w-5 text-bolt-elements-textSecondary" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <h2 className="break-words text-base font-semibold text-bolt-elements-textPrimary">
                      {copy['importHub.credential.source.title']}
                    </h2>
                    <p className="mt-1 break-words text-sm leading-6 text-bolt-elements-textSecondary">
                      {copy['importHub.credential.source.description']}
                    </p>
                  </div>
                </div>

                <Form method="post" className="mt-5 grid min-w-0 gap-4">
                  <input type="hidden" name="intent" value="stage" />
                  <input type="hidden" name="idempotencyKey" value={attemptId} />
                  {sourceError ? <ErrorNotice message={errorCopy(sourceError)} /> : null}

                  <div className="grid min-w-0 gap-2 text-sm font-medium text-bolt-elements-textPrimary">
                    <label htmlFor="credential-import-source-ref">
                      {copy[`importHub.credential.source.${provider}.label`]}
                    </label>
                    <input
                      id="credential-import-source-ref"
                      name="sourceRef"
                      required
                      disabled={!activeConnection || previewing}
                      aria-describedby={provider === 'figma' ? 'credential-import-figma-help' : undefined}
                      placeholder={copy[`importHub.credential.source.${provider}.placeholder`]}
                      autoComplete="off"
                      className="min-h-11 w-full min-w-0 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)] disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
                    />
                    {provider === 'figma' ? (
                      <span
                        id="credential-import-figma-help"
                        className="text-xs font-normal leading-5 text-bolt-elements-textTertiary"
                      >
                        {copy['importHub.credential.source.figma.help']}
                      </span>
                    ) : null}
                  </div>

                  {provider === 'vercel' ? (
                    <label className="grid min-w-0 gap-2 text-sm font-medium text-bolt-elements-textPrimary">
                      {copy['importHub.credential.source.vercel.scopeLabel']}
                      <input
                        name="scopeRef"
                        disabled={!activeConnection || previewing}
                        placeholder={copy['importHub.credential.source.vercel.scopePlaceholder']}
                        autoComplete="off"
                        className="min-h-11 w-full min-w-0 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)] disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
                      />
                      <span className="text-xs font-normal leading-5 text-bolt-elements-textTertiary">
                        {copy['importHub.credential.source.vercel.scopeHelp']}
                      </span>
                    </label>
                  ) : null}

                  {provider === 'claude' ? (
                    <>
                      <label className="grid min-w-0 gap-2 text-sm font-medium text-bolt-elements-textPrimary">
                        {copy['importHub.credential.source.claude.payloadLabel']}
                        <textarea
                          name="sourcePayload"
                          required
                          rows={10}
                          maxLength={2 * 1024 * 1024}
                          disabled={!activeConnection || previewing}
                          className="w-full min-w-0 resize-y rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)] disabled:cursor-not-allowed disabled:opacity-50"
                        />
                        <span className="text-xs font-normal leading-5 text-bolt-elements-textTertiary">
                          {copy['importHub.credential.source.claude.payloadHelp']}
                        </span>
                      </label>
                      <label className="grid min-w-0 gap-2 text-sm font-medium text-bolt-elements-textPrimary">
                        {copy['importHub.credential.source.claude.pathLabel']}
                        <input
                          name="targetPath"
                          required
                          disabled={!activeConnection || previewing}
                          placeholder={copy['importHub.credential.source.claude.pathPlaceholder']}
                          autoComplete="off"
                          className="min-h-11 w-full min-w-0 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 font-mono text-base outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)] disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
                        />
                      </label>
                    </>
                  ) : null}

                  <div>
                    <Button
                      type="submit"
                      disabled={!activeConnection || previewing}
                      aria-busy={previewing}
                      className="min-h-11 w-full whitespace-normal sm:w-auto"
                    >
                      {previewing
                        ? copy['importHub.credential.source.previewing']
                        : copy['importHub.credential.source.preview']}
                    </Button>
                    {previewing ? <BusyProgress label={copy['importHub.credential.source.progress']} /> : null}
                  </div>
                </Form>
              </section>
            ) : (
              <section className="min-w-0 rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 sm:p-6">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-bolt-elements-background-depth-1">
                    <ShieldCheck className="h-5 w-5 text-[var(--status-success)]" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <h2 className="break-words text-base font-semibold text-bolt-elements-textPrimary">
                      {copy['importHub.credential.preview.title']}
                    </h2>
                    <p className="mt-1 break-words text-sm leading-6 text-bolt-elements-textSecondary">
                      {copy['importHub.credential.preview.description']}
                    </p>
                  </div>
                </div>

                {review.errorCode ? <ErrorNotice message={errorCopy(review.errorCode)} /> : null}

                <div className="mt-5 min-w-0 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4">
                  <h3 className="break-words text-lg font-semibold text-bolt-elements-textPrimary">
                    {review.preview.title}
                  </h3>
                  <p className="mt-1 break-all text-xs text-bolt-elements-textTertiary">{review.preview.sourceRef}</p>
                  <dl className="mt-4 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
                    {review.preview.facts.map((fact) => (
                      <div
                        key={`${fact.key}:${fact.value}`}
                        className="min-w-0 rounded-lg bg-bolt-elements-background-depth-2 p-3"
                      >
                        <dt className="text-xs font-medium text-bolt-elements-textTertiary">
                          {copy[`importHub.credential.preview.fact.${fact.key}`]}
                        </dt>
                        <dd className="mt-1 break-words text-sm text-bolt-elements-textPrimary">{fact.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>

                {review.preview.warnings.map((warning) => (
                  <div
                    key={warning}
                    className="mt-4 flex min-w-0 items-start gap-2 rounded-lg border border-[var(--status-warning)]/40 bg-[var(--status-warning)]/10 px-3 py-2 text-sm leading-6 text-[var(--status-warning-text)]"
                    role="note"
                  >
                    <AlertTriangle className="mt-1 h-4 w-4 shrink-0" aria-hidden />
                    <span className="min-w-0 break-words">
                      {copy[`importHub.credential.preview.warning.${warning}`]}
                    </span>
                  </div>
                ))}

                <div className="mt-5 min-w-0">
                  <h3 className="text-sm font-semibold text-bolt-elements-textPrimary">
                    {copy['importHub.credential.preview.files']}
                  </h3>
                  <p className="mt-1 text-xs text-bolt-elements-textTertiary">
                    {text(copy['importHub.credential.preview.summary'], {
                      files: review.preview.fileCount,
                      bytes,
                    })}
                  </p>
                  <ul className="mt-2 grid min-w-0 gap-2">
                    {review.preview.paths.map((path) => (
                      <li
                        key={path}
                        className="min-w-0 break-all rounded-md border border-bolt-elements-borderColor px-3 py-2 font-mono text-xs text-bolt-elements-textSecondary"
                      >
                        {path}
                      </li>
                    ))}
                  </ul>
                </div>

                <Form method="post" className="mt-5 min-w-0">
                  <input type="hidden" name="intent" value="commit" />
                  <input type="hidden" name="importJobId" value={review.importJobId} />

                  {review.findings.length > 0 ? (
                    <fieldset className="min-w-0 rounded-lg border border-[var(--status-warning)]/40 p-3 sm:p-4">
                      <legend className="px-1 text-sm font-semibold text-bolt-elements-textPrimary">
                        {copy['importHub.credential.preview.findings.title']}
                      </legend>
                      <p className="mb-4 break-words text-sm leading-6 text-bolt-elements-textSecondary">
                        {copy['importHub.credential.preview.findings.description']}
                      </p>
                      <div className="grid min-w-0 gap-4">
                        {review.findings.map((finding) => {
                          const findingKey = `${finding.path}:${finding.line}`;
                          const inputName = `consent:${findingKey}`;

                          return (
                            <fieldset
                              key={findingKey}
                              className="min-w-0 rounded-lg bg-bolt-elements-background-depth-1 p-3"
                            >
                              <legend className="max-w-full break-all px-1 text-xs text-bolt-elements-textSecondary">
                                {text(copy['importHub.credential.preview.finding'], finding)}
                              </legend>
                              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                {(['keep', 'redact'] as const).map((decision) => (
                                  <label
                                    key={decision}
                                    className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-bolt-elements-borderColor px-3 py-2 text-sm text-bolt-elements-textPrimary focus-within:ring-2 focus-within:ring-[var(--vc-ide-accent-action)]"
                                  >
                                    <input type="radio" name={inputName} value={decision} required />
                                    <span className="break-words">
                                      {copy[`importHub.credential.preview.${decision}`]}
                                    </span>
                                  </label>
                                ))}
                              </div>
                            </fieldset>
                          );
                        })}
                      </div>
                    </fieldset>
                  ) : null}

                  <div className="mt-5 flex min-w-0 flex-col items-stretch gap-2 sm:flex-row sm:items-center">
                    <Button
                      type="submit"
                      disabled={committing || cancelling}
                      aria-busy={committing}
                      className="min-h-11 whitespace-normal"
                    >
                      {committing
                        ? copy['importHub.credential.preview.creating']
                        : copy['importHub.credential.preview.create']}
                    </Button>
                  </div>
                  {committing ? <BusyProgress label={copy['importHub.credential.preview.progress']} /> : null}
                </Form>

                <Form method="post" className="mt-2">
                  <input type="hidden" name="intent" value="cancel" />
                  <input type="hidden" name="importJobId" value={review.importJobId} />
                  <button
                    type="submit"
                    disabled={committing || cancelling}
                    aria-busy={cancelling}
                    className="min-h-11 w-full rounded px-3 text-sm text-bolt-elements-textSecondary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)] disabled:opacity-50 sm:w-auto"
                  >
                    {cancelling
                      ? copy['importHub.credential.preview.cancelling']
                      : copy['importHub.credential.preview.cancel']}
                  </button>
                  {cancelling ? <BusyProgress label={copy['importHub.credential.preview.cancelProgress']} /> : null}
                </Form>
              </section>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
