import { AlertTriangle, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Form, useActionData, useLoaderData, useNavigation, useRevalidator } from 'react-router';
import { AsyncPanelError, AsyncPanelSkeleton } from '~/components/dashboard/AsyncPanelState';
import { EnterpriseFormPage, PrimaryButton, TextField } from '~/components/enterprise/EnterpriseFormPage';
import {
  apiErrorMessage,
  apiRequest,
  firstOrganizationOrNull,
  formObject,
  isApiResponse,
  json,
  redirect,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
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
      loadError = "You don't have permission to manage this organization's security settings.";
      loadErrorKind = 'permission';
    } else {
      loadError = await apiErrorMessage(error, 'Security settings are temporarily unavailable.');
      loadErrorKind = 'temporary';
    }
  }

  return json({
    orgId: organization.id,
    orgName: organization.name ?? organization.slug ?? organization.id,
    settings: settings ?? { ...FALLBACK_SETTINGS, organizationId: organization.id },
    loadError,
    loadErrorKind,
  });
}

export async function action({ request }: EnterpriseActionArgs) {
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
    return json({ error: 'Your organization is unavailable. Reload the page and try again.' }, { status: 400 });
  }

  const ipAllowlist = (body.ipAllowlist ?? '')
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);

  const invalid = ipAllowlist.filter((entry) => !isValidIpOrCidr(entry));

  if (invalid.length > 0) {
    return json({ error: `Not a valid IP address or CIDR block: ${invalid.join(', ')}` }, { status: 400 });
  }

  const sessionDurationMinutes = body.sessionDurationMinutes ? Number(body.sessionDurationMinutes) : undefined;

  if (
    sessionDurationMinutes !== undefined &&
    (!Number.isInteger(sessionDurationMinutes) ||
      sessionDurationMinutes < SESSION_MIN_MINUTES ||
      sessionDurationMinutes > SESSION_MAX_MINUTES)
  ) {
    return json(
      { error: `Session duration must be between ${SESSION_MIN_MINUTES} and ${SESSION_MAX_MINUTES} minutes.` },
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
      { error: `Data retention must be between ${RETENTION_MIN_DAYS} and ${RETENTION_MAX_DAYS} days.` },
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

    return json({ status: 'Organization security settings saved.' });
  } catch (error) {
    if (isReauthRedirect(error) || shouldRethrowActionError(error)) {
      throw error;
    }

    if (isApiResponse(error, 403)) {
      return json(
        { error: "You don't have permission to change this organization's security settings." },
        { status: 403 },
      );
    }

    if (isApiResponse(error)) {
      return json(
        { error: await apiErrorMessage(error, 'Could not save security settings.') },
        { status: error.status },
      );
    }

    return json({ error: 'Saving security settings is temporarily unavailable. Please try again in a moment.' });
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
    <label className="flex cursor-pointer items-start gap-3 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4">
      <input
        type="checkbox"
        name={props.name}
        defaultChecked={props.defaultChecked}
        onChange={(event) => props.onChange?.(event.currentTarget.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-bolt-elements-borderColor accent-bolt-elements-item-contentAccent"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-bolt-elements-textPrimary">{props.label}</span>
        <span
          className={classNames(
            'mt-1 block text-xs',
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
  const { orgId, orgName, settings, loadError, loadErrorKind } = useLoaderData<typeof loader>();
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
  const [draftError, setDraftError] = useState<string | null>(null);
  const [legalHold, setLegalHold] = useState(settings.legalHoldEnabled);

  if (loadError) {
    return (
      <EnterpriseFormPage
        title="Organization security"
        description={`Authoritative security policy for ${orgName}: IP allowlist, session lifetime, admin MFA, data retention and legal hold.`}
      >
        {retrying ? (
          <AsyncPanelSkeleton label="Loading organization security settings" rows={5} />
        ) : (
          <AsyncPanelError
            title={
              loadErrorKind === 'permission' ? 'Security settings are restricted' : 'Security settings could not load'
            }
            description={
              loadErrorKind === 'permission'
                ? "Your role cannot manage this organization's security policy. No settings can be changed from this page."
                : 'The editor is hidden to prevent fallback values from overwriting the current policy. No settings were changed.'
            }
            onRetry={revalidator.revalidate}
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
      setDraftError('Enter a valid IP address or CIDR block, e.g. 203.0.113.10 or 198.51.100.0/24.');
      return;
    }

    if (entries.includes(value)) {
      setDraftError('That entry is already in the allowlist.');
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
      title="Organization security"
      description={`Authoritative security policy for ${orgName}: IP allowlist, session lifetime, admin MFA, data retention and legal hold.`}
      status={actionData?.status}
      error={actionData?.error}
    >
      <Form method="post" className="space-y-8">
        <input type="hidden" name="orgId" value={orgId} />

        <section>
          <h2 className="text-base font-semibold text-bolt-elements-textPrimary">IP allowlist</h2>
          <p className="mt-1 text-sm text-bolt-elements-textSecondary">
            Only these IP addresses or CIDR ranges may access the organization. Leave empty to allow all.
          </p>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
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
              placeholder="203.0.113.10 or 198.51.100.0/24"
              className="w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm outline-none focus:border-bolt-elements-focus"
              aria-label="IP address or CIDR block"
            />
            <button
              type="button"
              onClick={addEntry}
              className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-md border border-bolt-elements-borderColor px-3 text-sm font-medium text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Add
            </button>
          </div>

          {draftError ? <p className="mt-2 text-xs text-[var(--status-error-text)]">{draftError}</p> : null}

          {entries.length > 0 ? (
            <ul className="mt-3 overflow-hidden rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1">
              {entries.map((entry, index) => (
                <li
                  key={entry}
                  className={classNames(
                    'flex items-center justify-between gap-3 px-3 py-2',
                    index > 0 && 'border-t border-bolt-elements-borderColor',
                  )}
                >
                  <span className="break-all font-mono text-xs text-bolt-elements-textPrimary">{entry}</span>
                  <button
                    type="button"
                    onClick={() => removeEntry(entry)}
                    className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-medium text-[var(--status-error-text)] hover:bg-[var(--status-error-bg)]"
                    aria-label={`Remove ${entry}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-xs text-bolt-elements-textTertiary">
              No restrictions — every IP address is allowed.
            </p>
          )}

          {/* Serialized allowlist the action re-parses (newline-delimited). */}
          <input type="hidden" name="ipAllowlist" value={entries.join('\n')} />
        </section>

        <section className="grid gap-4 border-t border-bolt-elements-borderColor pt-8 sm:grid-cols-2">
          <TextField
            label={`Session duration (minutes, ${SESSION_MIN_MINUTES}–${SESSION_MAX_MINUTES})`}
            name="sessionDurationMinutes"
            type="number"
            defaultValue={String(settings.sessionDurationMinutes)}
          />
          <TextField
            label={`Data retention (days, ${RETENTION_MIN_DAYS}–${RETENTION_MAX_DAYS})`}
            name="dataRetentionDays"
            type="number"
            defaultValue={String(settings.dataRetentionDays)}
          />
        </section>

        <section className="space-y-3 border-t border-bolt-elements-borderColor pt-8">
          <ToggleRow
            name="requireMfaForAdmins"
            label="Require MFA for admins"
            description="Organization admins must enrol an authenticator before accessing admin surfaces."
            defaultChecked={settings.requireMfaForAdmins}
          />
          <ToggleRow
            name="legalHoldEnabled"
            label="Legal hold"
            description={
              legalHold
                ? 'Legal hold is ON — data deletion is blocked org-wide until it is turned off, even after retention expires.'
                : 'When enabled, blocks all data deletion org-wide (overrides the retention window). Enable only for litigation/compliance holds.'
            }
            defaultChecked={settings.legalHoldEnabled}
            warn={legalHold}
            onChange={setLegalHold}
          />
          {legalHold ? (
            <p className="flex items-start gap-2 rounded-md border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-3 py-2 text-xs text-[var(--status-warning-text)]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              While legal hold is active, no data — including expired records — can be deleted for this organization.
            </p>
          ) : null}
        </section>

        <div className="flex items-center gap-3 border-t border-bolt-elements-borderColor pt-6">
          <PrimaryButton disabled={busy}>
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4" aria-hidden />
              Save security settings
            </span>
          </PrimaryButton>
          {settings.updatedAt ? (
            <span className="text-xs text-bolt-elements-textTertiary">
              Last updated {formatUserAreaDateTime(settings.updatedAt) ?? 'date unavailable'}
            </span>
          ) : null}
        </div>
      </Form>
    </EnterpriseFormPage>
  );
}
