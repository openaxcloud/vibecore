import { AlertTriangle, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Form, useActionData, useLoaderData, useNavigation, useRevalidator } from 'react-router';
import { AsyncPanelError, AsyncPanelSkeleton } from '~/components/dashboard/AsyncPanelState';
import { EnterpriseFormPage, PrimaryButton, TextField } from '~/components/enterprise/EnterpriseFormPage';
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

  /*
   * The GET handler requires enterprise:read; a caller without it gets a 403
   * whose message we surface as a friendly banner rather than a crash. Any 3xx
   * re-auth redirect must propagate so the framework performs the navigation.
   */
  let settings: EnterpriseSettings | null = null;
  let loadError: string | null = null;
  let loadErrorKind: 'permission' | 'temporary' | null = null;

  try {
    const result = await apiRequest<{ settings: EnterpriseSettings }>(
      request,
      `/orgs/${organization.id}/enterprise-settings`,
    );
    settings = result.settings;
  } catch (error) {
    if (isReauthRedirect(error)) {
      throw error;
    }

    if (isApiResponse(error, 403)) {
      loadError = copy['organizationSecurity.errors.permissionView'];
      loadErrorKind = 'permission';
    } else {
      loadError = copy['organizationSecurity.errors.temporaryLoad'];
      loadErrorKind = 'temporary';
    }
  }

  return json({
    orgId: organization.id,
    orgName: organization.name ?? organization.slug ?? organization.id,
    settings: settings ?? { ...FALLBACK_SETTINGS, organizationId: organization.id },
    loadError,
    loadErrorKind,
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
    language: loaderLanguage,
  } = useLoaderData<typeof loader>();

  const language = resolveOrganizationSecurityLanguage(loaderLanguage);
  const copy = getOrganizationSecurityCopy(language);

  const pageDescription = formatOrganizationSecurityCopy(copy['organizationSecurity.description'], {
    organization: orgName,
  });

  const actionData = useActionData<typeof action>() as { status?: string; error?: string } | undefined;
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const busy = navigation.state !== 'idle';
  const retrying = revalidator.state !== 'idle';

  /*
   * IP allowlist is edited as an interactive add/remove list, then serialized
   * into a hidden newline-delimited field the action re-parses (matches the API,
   * which stores a string[]).
   */
  const [entries, setEntries] = useState<string[]>(settings.ipAllowlist);
  const [draft, setDraft] = useState('');
  const [draftError, setDraftError] = useState<'invalid' | 'duplicate' | null>(null);
  const [legalHold, setLegalHold] = useState(settings.legalHoldEnabled);

  if (loadError) {
    return (
      <EnterpriseFormPage title={copy['organizationSecurity.title']} description={pageDescription}>
        {retrying ? (
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
            tone={loadErrorKind === 'permission' ? 'warning' : 'error'}
          />
        )}
      </EnterpriseFormPage>
    );
  }

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
                    aria-label={formatOrganizationSecurityCopy(copy['organizationSecurity.allowlist.removeAria'], {
                      entry,
                    })}
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
    </EnterpriseFormPage>
  );
}
