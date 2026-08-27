import { AlertTriangle, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Form, useActionData, useFetcher, useLoaderData, useNavigation, useRevalidator } from 'react-router';
import { AsyncPanelError, AsyncPanelSkeleton } from '~/components/dashboard/AsyncPanelState';
import { EnterpriseFormPage, PrimaryButton, TextField } from '~/components/enterprise/EnterpriseFormPage';
import {
  mergeSecurityCenterEvents,
  OrganizationCapabilitiesPanel,
  type EnterpriseCapabilities,
  type OrganizationCapabilitiesErrorKind,
  type SecurityCenterErrorKind,
  type SecurityCenterEvent,
} from '~/components/enterprise/OrganizationCapabilitiesPanel';
import {
  apiRequest,
  firstOrganizationOrNull,
  formObject,
  isApiResponse,
  json,
  redirect,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import {
  formatOrganizationSecurityCopy,
  formatOrganizationSecurityNumber,
  getOrganizationSecurityCopy,
  resolveOrganizationSecurityLanguage,
} from '~/lib/i18n/catalogs/organization-security';
import { resolveRequestLocale } from '~/lib/i18n/request-locale';
import { formatUserAreaDateTime } from '~/lib/i18n/user-area-locale';
import { isReauthRedirect, shouldRethrowActionError } from '~/lib/route-reauth';
import { classNames } from '~/utils/classNames';

/*
 * ORG-admin authoritative surface for the org's enterprise security policy,
 * backed by the existing GET/PATCH /orgs/:orgId/enterprise-settings endpoints
 * (app.ts:14527 / 14533; zod `enterpriseSettingsSchema` app.ts:879). This is
 * distinct from session-security.tsx which renders a SUBSET of the same policy
 * at the user-account level — that route is intentionally left untouched.
 */
type EnterpriseSettings = {
  organizationId: string;
  ipAllowlist: string[];
  sessionDurationMinutes: number;
  requireMfaForAdmins: boolean;
  dataRetentionDays: number;
  legalHoldEnabled: boolean;
  updatedAt: string;
};

type SecurityCenterResponse = {
  events: SecurityCenterEvent[];
  openCount: number;
  nextCursor: string | null;
  limit: number;
};

export type SecurityCenterFetcherData = {
  page: SecurityCenterResponse | null;
  errorKind: SecurityCenterErrorKind | null;
};

type OrganizationSecurityLoaderData = {
  orgId: string;
  orgName: string;
  settings: EnterpriseSettings;
  loadError: string | null;
  loadErrorKind: 'permission' | 'temporary' | null;
  capabilities: EnterpriseCapabilities | null;
  capabilitiesErrorKind: OrganizationCapabilitiesErrorKind | null;
  securityEvents: SecurityCenterEvent[];
  securityOpenCount: number;
  securityNextCursor: string | null;
  securityErrorKind: SecurityCenterErrorKind | null;
  language: ReturnType<typeof resolveOrganizationSecurityLanguage>;
};

const SECURITY_CENTER_PAGE_LIMIT = 25;

async function securityCenterErrorKind(error: unknown): Promise<SecurityCenterErrorKind> {
  if (!isApiResponse(error, 403)) {
    return 'temporary';
  }

  try {
    const payload = (await error.clone().json()) as { code?: unknown };
    return payload.code === 'ENTERPRISE_CAPABILITY_OPERATOR_REQUIRED' ? 'operator-required' : 'permission';
  } catch {
    return 'permission';
  }
}

/*
 * Backend defaults (packages/database prisma + prisma-store.ts): a fresh org's
 * settings row is created lazily by the GET handler with these values, so the
 * form always prefills from a real record. Kept here only for the degraded case
 * where the GET call briefly fails and we must still render an editable form.
 */
const FALLBACK_SETTINGS: EnterpriseSettings = {
  organizationId: '',
  ipAllowlist: [],
  sessionDurationMinutes: 43200,
  requireMfaForAdmins: false,
  dataRetentionDays: 365,
  legalHoldEnabled: false,
  updatedAt: '',
};

// enterpriseSettingsSchema bounds (app.ts:879): min 5 minutes, max 365 days.
const SESSION_MIN_MINUTES = 5;
const SESSION_MAX_MINUTES = 60 * 24 * 365;

// dataRetentionDays bounds (app.ts:888): 1..3650.
const RETENTION_MIN_DAYS = 1;
const RETENTION_MAX_DAYS = 3650;

/*
 * Accepts a bare IPv4/IPv6 address or a CIDR block (client-side sanity check only;
 * the API stores the raw strings). Mirrors the `203.0.113.10` / `198.51.100.0/24`
 * examples the operator sees in the placeholder.
 */
function isValidIpOrCidr(value: string): boolean {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return false;
  }

  const [address, prefix, ...rest] = trimmed.split('/');

  if (rest.length > 0) {
    return false;
  }

  const isIpv4 = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/.test(address);

  const isIpv6 = /^[0-9a-fA-F:]+$/.test(address) && address.includes(':');

  if (!isIpv4 && !isIpv6) {
    return false;
  }

  if (prefix === undefined) {
    return true;
  }

  if (!/^\d{1,3}$/.test(prefix)) {
    return false;
  }

  const max = isIpv4 ? 32 : 128;
  const parsed = Number(prefix);

  return parsed >= 0 && parsed <= max;
}

export async function loader({ request }: EnterpriseLoaderArgs) {
  const language = resolveOrganizationSecurityLanguage(resolveRequestLocale(request).language);
  const copy = getOrganizationSecurityCopy(language);
  const organization = await firstOrganizationOrNull(request);

  if (!organization) {
    return redirect('/');
  }

  const url = new URL(request.url);

  /*
   * Cursor resource branch consumed by useFetcher. The cursor stays opaque and
   * is forwarded verbatim after URL encoding; the API owns validation,
   * tenant-scoping, stable ordering and the resolution join.
   */
  if (url.searchParams.get('securityCenter') === '1') {
    const cursor = url.searchParams.get('cursor');
    const query = new URLSearchParams({ limit: String(SECURITY_CENTER_PAGE_LIMIT) });

    if (cursor) {
      query.set('cursor', cursor);
    }

    try {
      const page = await apiRequest<SecurityCenterResponse>(
        request,
        `/orgs/${organization.id}/security-center/events?${query.toString()}`,
      );

      return json<SecurityCenterFetcherData>({ page, errorKind: null });
    } catch (error) {
      if (isReauthRedirect(error)) {
        throw error;
      }

      return json<SecurityCenterFetcherData>({
        page: null,
        errorKind: await securityCenterErrorKind(error),
      });
    }
  }

  /*
   * The GET handler requires enterprise:read; a caller without it gets a 403
   * whose message we surface as a friendly banner rather than a crash. Any 3xx
   * re-auth redirect must propagate so the framework performs the navigation.
   */
  let settings: EnterpriseSettings | null = null;
  let loadError: string | null = null;
  let loadErrorKind: 'permission' | 'temporary' | null = null;
  let capabilities: EnterpriseCapabilities | null = null;
  let capabilitiesErrorKind: OrganizationCapabilitiesErrorKind | null = null;
  let securityEvents: SecurityCenterEvent[] = [];
  let securityOpenCount = 0;
  let securityNextCursor: string | null = null;
  let securityErrorKind: SecurityCenterErrorKind | null = null;

  /*
   * Settings and capability admission are independent surfaces. Load them in
   * parallel so a temporary capability outage never hides the authoritative
   * security-policy editor (and vice versa). Re-auth redirects still propagate.
   */
  const [settingsResult, capabilitiesResult] = await Promise.allSettled([
    apiRequest<{ settings: EnterpriseSettings }>(request, `/orgs/${organization.id}/enterprise-settings`),
    apiRequest<EnterpriseCapabilities>(request, `/orgs/${organization.id}/enterprise-capabilities`),
  ]);

  if (settingsResult.status === 'fulfilled') {
    settings = settingsResult.value.settings;
  } else {
    if (isReauthRedirect(settingsResult.reason)) {
      throw settingsResult.reason;
    }

    if (isApiResponse(settingsResult.reason, 403)) {
      loadError = copy['organizationSecurity.errors.permissionView'];
      loadErrorKind = 'permission';
    } else {
      loadError = copy['organizationSecurity.errors.temporaryLoad'];
      loadErrorKind = 'temporary';
    }
  }

  if (capabilitiesResult.status === 'fulfilled') {
    capabilities = capabilitiesResult.value;
  } else {
    if (isReauthRedirect(capabilitiesResult.reason)) {
      throw capabilitiesResult.reason;
    }

    capabilitiesErrorKind = isApiResponse(capabilitiesResult.reason, 403) ? 'permission' : 'temporary';
  }

  const securityCapability = capabilities?.capabilities.find((capability) => capability.key === 'security-center');

  if (securityCapability?.state === 'ready' && securityCapability.surface === 'security-center-events') {
    try {
      const result = await apiRequest<SecurityCenterResponse>(
        request,
        `/orgs/${organization.id}/security-center/events?limit=${SECURITY_CENTER_PAGE_LIMIT}`,
      );
      securityEvents = Array.isArray(result.events) ? result.events : [];
      securityOpenCount = Number.isSafeInteger(result.openCount) && result.openCount >= 0 ? result.openCount : 0;
      securityNextCursor =
        typeof result.nextCursor === 'string' && result.nextCursor.length > 0 ? result.nextCursor : null;
    } catch (error) {
      if (isReauthRedirect(error)) {
        throw error;
      }

      securityErrorKind = await securityCenterErrorKind(error);
    }
  }

  return json({
    orgId: organization.id,
    orgName: organization.name ?? organization.slug ?? organization.id,
    settings: settings ?? { ...FALLBACK_SETTINGS, organizationId: organization.id },
    loadError,
    loadErrorKind,
    capabilities,
    capabilitiesErrorKind,
    securityEvents,
    securityOpenCount,
    securityNextCursor,
    securityErrorKind,
    language,
  });
}

export async function action({ request }: EnterpriseActionArgs) {
  const language = resolveOrganizationSecurityLanguage(resolveRequestLocale(request).language);
  const copy = getOrganizationSecurityCopy(language);
  const form = await request.formData();

  const body = formObject(form) as {
    orgId?: string;
    ipAllowlist?: string;
    sessionDurationMinutes?: string;
    dataRetentionDays?: string;
    requireMfaForAdmins?: string;
    legalHoldEnabled?: string;
  };

  if (!body.orgId) {
    return json({ error: copy['organizationSecurity.errors.organizationUnavailable'] }, { status: 400 });
  }

  const ipAllowlist = (body.ipAllowlist ?? '')
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);

  const invalid = ipAllowlist.filter((entry) => !isValidIpOrCidr(entry));

  if (invalid.length > 0) {
    return json(
      {
        error: formatOrganizationSecurityCopy(copy['organizationSecurity.errors.invalidIp'], {
          entries: invalid.join(', '),
        }),
      },
      { status: 400 },
    );
  }

  const sessionDurationMinutes = body.sessionDurationMinutes ? Number(body.sessionDurationMinutes) : undefined;

  if (
    sessionDurationMinutes !== undefined &&
    (!Number.isInteger(sessionDurationMinutes) ||
      sessionDurationMinutes < SESSION_MIN_MINUTES ||
      sessionDurationMinutes > SESSION_MAX_MINUTES)
  ) {
    return json(
      {
        error: formatOrganizationSecurityCopy(copy['organizationSecurity.errors.sessionRange'], {
          minimum: formatOrganizationSecurityNumber(SESSION_MIN_MINUTES, language),
          maximum: formatOrganizationSecurityNumber(SESSION_MAX_MINUTES, language),
        }),
      },
      { status: 400 },
    );
  }

  const dataRetentionDays = body.dataRetentionDays ? Number(body.dataRetentionDays) : undefined;

  if (
    dataRetentionDays !== undefined &&
    (!Number.isInteger(dataRetentionDays) ||
      dataRetentionDays < RETENTION_MIN_DAYS ||
      dataRetentionDays > RETENTION_MAX_DAYS)
  ) {
    return json(
      {
        error: formatOrganizationSecurityCopy(copy['organizationSecurity.errors.retentionRange'], {
          minimum: formatOrganizationSecurityNumber(RETENTION_MIN_DAYS, language),
          maximum: formatOrganizationSecurityNumber(RETENTION_MAX_DAYS, language),
        }),
      },
      { status: 400 },
    );
  }

  try {
    await apiRequest(request, `/orgs/${body.orgId}/enterprise-settings`, {
      method: 'PATCH',
      body: JSON.stringify({
        ipAllowlist,
        sessionDurationMinutes,
        dataRetentionDays,
        requireMfaForAdmins: body.requireMfaForAdmins === 'on',
        legalHoldEnabled: body.legalHoldEnabled === 'on',
      }),
    });

    return json({ status: copy['organizationSecurity.success.saved'] });
  } catch (error) {
    if (isReauthRedirect(error) || shouldRethrowActionError(error)) {
      throw error;
    }

    if (isApiResponse(error, 403)) {
      return json({ error: copy['organizationSecurity.errors.permissionChange'] }, { status: 403 });
    }

    if (isApiResponse(error)) {
      return json({ error: copy['organizationSecurity.errors.save'] }, { status: error.status });
    }

    return json({ error: copy['organizationSecurity.errors.temporarySave'] });
  }
}

function ToggleRow(props: {
  name: string;
  label: string;
  description: string;
  defaultChecked: boolean;
  warn?: boolean;
  onChange?: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4">
      <input
        type="checkbox"
        name={props.name}
        defaultChecked={props.defaultChecked}
        onChange={(event) => props.onChange?.(event.currentTarget.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-bolt-elements-borderColor accent-bolt-elements-item-contentAccent"
      />
      <span className="min-w-0 flex-1">
        <span className="block break-words text-sm font-medium text-bolt-elements-textPrimary">{props.label}</span>
        <span
          className={classNames(
            'mt-1 block break-words text-xs leading-5',
            props.warn ? 'text-[var(--status-warning-text)]' : 'text-bolt-elements-textSecondary',
          )}
        >
          {props.description}
        </span>
      </span>
    </label>
  );
}

export default function OrganizationSecurityPage() {
  const {
    orgId,
    orgName,
    settings,
    loadError,
    loadErrorKind,
    capabilities,
    capabilitiesErrorKind,
    securityEvents,
    securityOpenCount,
    securityNextCursor,
    securityErrorKind,
    language: loaderLanguage,
  } = useLoaderData() as OrganizationSecurityLoaderData;

  const language = resolveOrganizationSecurityLanguage(loaderLanguage);
  const copy = getOrganizationSecurityCopy(language);

  const pageDescription = formatOrganizationSecurityCopy(copy['organizationSecurity.description'], {
    organization: orgName,
  });

  const actionData = useActionData<typeof action>() as { status?: string; error?: string } | undefined;
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const securityFetcher = useFetcher<SecurityCenterFetcherData>();
  const busy = navigation.state !== 'idle';
  const retrying = revalidator.state !== 'idle';
  const securityLoadingMore = securityFetcher.state !== 'idle';

  /*
   * IP allowlist is edited as an interactive add/remove list, then serialized
   * into a hidden newline-delimited field the action re-parses (matches the API,
   * which stores a string[]).
   */
  const [entries, setEntries] = useState<string[]>(settings.ipAllowlist);
  const [draft, setDraft] = useState('');
  const [draftError, setDraftError] = useState<'invalid' | 'duplicate' | null>(null);
  const [legalHold, setLegalHold] = useState(settings.legalHoldEnabled);
  const [visibleSecurityEvents, setVisibleSecurityEvents] = useState<SecurityCenterEvent[]>(securityEvents);
  const [visibleSecurityOpenCount, setVisibleSecurityOpenCount] = useState(securityOpenCount);
  const [visibleSecurityNextCursor, setVisibleSecurityNextCursor] = useState<string | null>(securityNextCursor);
  const [securityLoadMoreErrorKind, setSecurityLoadMoreErrorKind] = useState<SecurityCenterErrorKind | null>(null);
  const [lastSecurityCursor, setLastSecurityCursor] = useState<string | null>(null);

  useEffect(() => {
    setVisibleSecurityEvents(securityEvents);
    setVisibleSecurityOpenCount(securityOpenCount);
    setVisibleSecurityNextCursor(securityNextCursor);
    setSecurityLoadMoreErrorKind(null);
    setLastSecurityCursor(null);
  }, [securityEvents, securityNextCursor, securityOpenCount]);

  useEffect(() => {
    const result = securityFetcher.data;

    if (!result) {
      return;
    }

    const page = result.page;

    if (page) {
      setVisibleSecurityEvents((current) => mergeSecurityCenterEvents(current, page.events));
      setVisibleSecurityOpenCount(page.openCount);
      setVisibleSecurityNextCursor(page.nextCursor);
      setSecurityLoadMoreErrorKind(null);

      return;
    }

    if (result.errorKind) {
      setSecurityLoadMoreErrorKind(result.errorKind);
    }
  }, [securityFetcher.data]);

  const loadSecurityCursor = (cursor: string | null) => {
    if (!cursor || securityFetcher.state !== 'idle') {
      return;
    }

    const params = new URLSearchParams({ securityCenter: '1', cursor });

    if (language === 'fr') {
      params.set('lang', 'fr');
    }

    setLastSecurityCursor(cursor);
    setSecurityLoadMoreErrorKind(null);
    securityFetcher.load(`/organization-security?${params.toString()}`);
  };

  const addEntry = () => {
    const value = draft.trim();

    if (!value) {
      return;
    }

    if (!isValidIpOrCidr(value)) {
      setDraftError('invalid');
      return;
    }

    if (entries.includes(value)) {
      setDraftError('duplicate');
      return;
    }

    setEntries((prev) => [...prev, value]);
    setDraft('');
    setDraftError(null);
  };

  const removeEntry = (value: string) => {
    setEntries((prev) => prev.filter((entry) => entry !== value));
  };

  return (
    <EnterpriseFormPage
      title={copy['organizationSecurity.title']}
      description={pageDescription}
      status={actionData?.status}
      error={actionData?.error}
    >
      <div className="grid min-w-0 gap-8">
        <OrganizationCapabilitiesPanel
          copy={copy}
          language={language}
          capabilities={capabilities}
          capabilitiesErrorKind={capabilitiesErrorKind}
          securityEvents={visibleSecurityEvents}
          securityOpenCount={visibleSecurityOpenCount}
          securityErrorKind={securityErrorKind}
          securityNextCursor={visibleSecurityNextCursor}
          securityLoadingMore={securityLoadingMore}
          securityLoadMoreErrorKind={securityLoadMoreErrorKind}
          loading={retrying}
          retrying={retrying}
          onRetry={revalidator.revalidate}
          onLoadMore={() => loadSecurityCursor(visibleSecurityNextCursor)}
          onRetryLoadMore={() => loadSecurityCursor(lastSecurityCursor ?? visibleSecurityNextCursor)}
        />

        <div className="min-w-0 border-t border-bolt-elements-borderColor pt-8">
          {loadError ? (
            retrying ? (
              <AsyncPanelSkeleton label={copy['organizationSecurity.load.loading']} rows={5} />
            ) : (
              <AsyncPanelError
                title={
                  loadErrorKind === 'permission'
                    ? copy['organizationSecurity.load.permissionTitle']
                    : copy['organizationSecurity.load.errorTitle']
                }
                description={
                  loadErrorKind === 'permission'
                    ? copy['organizationSecurity.load.permissionDescription']
                    : copy['organizationSecurity.load.errorDescription']
                }
                onRetry={revalidator.revalidate}
                retryLabel={copy['organizationSecurity.load.retry']}
                retrying={retrying}
                tone={loadErrorKind === 'permission' ? 'warning' : 'error'}
              />
            )
          ) : (
            <Form method="post" className="space-y-8" aria-busy={busy}>
              <input type="hidden" name="orgId" value={orgId} />

              <section>
                <h2 className="break-words text-base font-semibold text-bolt-elements-textPrimary">
                  {copy['organizationSecurity.allowlist.title']}
                </h2>
                <p className="mt-1 break-words text-sm leading-6 text-bolt-elements-textSecondary">
                  {copy['organizationSecurity.allowlist.description']}
                </p>

                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <input
                    id="organization-security-ip-entry"
                    value={draft}
                    onChange={(event) => {
                      setDraft(event.target.value);
                      setDraftError(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        addEntry();
                      }
                    }}
                    placeholder={copy['organizationSecurity.allowlist.placeholder']}
                    className="min-h-[44px] w-full min-w-0 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm outline-none focus:border-bolt-elements-focus"
                    aria-label={copy['organizationSecurity.allowlist.inputAria']}
                    aria-invalid={Boolean(draftError)}
                    aria-describedby={draftError ? 'organization-security-ip-entry-error' : undefined}
                  />
                  <button
                    type="button"
                    onClick={addEntry}
                    className="inline-flex min-h-[44px] w-full shrink-0 items-center justify-center gap-1.5 whitespace-normal rounded-md border border-bolt-elements-borderColor px-3 py-2 text-center text-sm font-medium leading-snug text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3 sm:w-auto"
                  >
                    <Plus className="h-4 w-4" aria-hidden />
                    {copy['organizationSecurity.allowlist.add']}
                  </button>
                </div>

                {draftError ? (
                  <p
                    id="organization-security-ip-entry-error"
                    role="alert"
                    className="mt-2 break-words text-xs text-[var(--status-error-text)]"
                  >
                    {draftError === 'invalid'
                      ? copy['organizationSecurity.allowlist.invalidDraft']
                      : copy['organizationSecurity.allowlist.duplicate']}
                  </p>
                ) : null}

                {entries.length > 0 ? (
                  <ul className="mt-3 overflow-hidden rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1">
                    {entries.map((entry, index) => (
                      <li
                        key={entry}
                        className={classNames(
                          'flex flex-col items-stretch justify-between gap-2 px-3 py-2 sm:flex-row sm:items-center sm:gap-3',
                          index > 0 && 'border-t border-bolt-elements-borderColor',
                        )}
                      >
                        <span className="break-all font-mono text-xs text-bolt-elements-textPrimary">{entry}</span>
                        <button
                          type="button"
                          onClick={() => removeEntry(entry)}
                          className="inline-flex min-h-[44px] w-full shrink-0 items-center justify-center gap-1 whitespace-normal rounded-md px-2 py-2 text-center text-xs font-medium leading-snug text-[var(--status-error-text)] hover:bg-[var(--status-error-bg)] sm:w-auto"
                          aria-label={formatOrganizationSecurityCopy(
                            copy['organizationSecurity.allowlist.removeAria'],
                            {
                              entry,
                            },
                          )}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          {copy['organizationSecurity.allowlist.remove']}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 break-words text-xs text-bolt-elements-textTertiary">
                    {copy['organizationSecurity.allowlist.empty']}
                  </p>
                )}

                {/* Serialized allowlist the action re-parses (newline-delimited). */}
                <input type="hidden" name="ipAllowlist" value={entries.join('\n')} />
              </section>

              <section className="grid gap-4 border-t border-bolt-elements-borderColor pt-8 sm:grid-cols-2">
                <TextField
                  label={formatOrganizationSecurityCopy(copy['organizationSecurity.session.label'], {
                    minimum: formatOrganizationSecurityNumber(SESSION_MIN_MINUTES, language),
                    maximum: formatOrganizationSecurityNumber(SESSION_MAX_MINUTES, language),
                  })}
                  name="sessionDurationMinutes"
                  type="number"
                  defaultValue={String(settings.sessionDurationMinutes)}
                />
                <TextField
                  label={formatOrganizationSecurityCopy(copy['organizationSecurity.retention.label'], {
                    minimum: formatOrganizationSecurityNumber(RETENTION_MIN_DAYS, language),
                    maximum: formatOrganizationSecurityNumber(RETENTION_MAX_DAYS, language),
                  })}
                  name="dataRetentionDays"
                  type="number"
                  defaultValue={String(settings.dataRetentionDays)}
                />
              </section>

              <section className="space-y-3 border-t border-bolt-elements-borderColor pt-8">
                <ToggleRow
                  name="requireMfaForAdmins"
                  label={copy['organizationSecurity.mfa.label']}
                  description={copy['organizationSecurity.mfa.description']}
                  defaultChecked={settings.requireMfaForAdmins}
                />
                <ToggleRow
                  name="legalHoldEnabled"
                  label={copy['organizationSecurity.legalHold.label']}
                  description={
                    legalHold
                      ? copy['organizationSecurity.legalHold.enabledDescription']
                      : copy['organizationSecurity.legalHold.disabledDescription']
                  }
                  defaultChecked={settings.legalHoldEnabled}
                  warn={legalHold}
                  onChange={setLegalHold}
                />
                {legalHold ? (
                  <p
                    role="status"
                    className="flex items-start gap-2 rounded-md border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-3 py-2 text-xs leading-5 text-[var(--status-warning-text)]"
                  >
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    <span className="min-w-0 break-words">{copy['organizationSecurity.legalHold.warning']}</span>
                  </p>
                ) : null}
              </section>

              <div className="flex flex-col items-stretch gap-3 border-t border-bolt-elements-borderColor pt-6 sm:flex-row sm:items-center [&_button]:w-full sm:[&_button]:w-auto">
                <PrimaryButton disabled={busy}>
                  <span className="inline-flex min-w-0 items-center justify-center gap-1.5 whitespace-normal text-center leading-snug">
                    <ShieldCheck className="h-4 w-4" aria-hidden />
                    {busy ? copy['organizationSecurity.actions.saving'] : copy['organizationSecurity.actions.save']}
                  </span>
                </PrimaryButton>
                {settings.updatedAt ? (
                  <span className="min-w-0 break-words text-xs text-bolt-elements-textTertiary">
                    {formatOrganizationSecurityCopy(copy['organizationSecurity.updatedAt'], {
                      date:
                        formatUserAreaDateTime(settings.updatedAt, undefined, language) ??
                        copy['organizationSecurity.dateUnavailable'],
                    })}
                  </span>
                ) : null}
              </div>
            </Form>
          )}
        </div>
      </div>
    </EnterpriseFormPage>
  );
}
