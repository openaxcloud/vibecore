import { Check, Copy, Download, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { QRCode } from 'react-qrcode-logo';
import type { MetaFunction } from 'react-router';
import { redirect } from 'react-router';
import { Form, Link, useActionData, useLoaderData, useNavigation } from 'react-router';

import { EnterpriseFormPage, PrimaryButton } from '~/components/enterprise/EnterpriseFormPage';
import {
  apiRequest,
  formObject,
  json,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import { getMfaSetupCopy, resolveMfaSetupLanguage, type MfaSetupCopy } from '~/lib/i18n/catalogs/mfa-setup';
import { resolveRequestLocale } from '~/lib/i18n/request-locale';
import { isReauthRedirect } from '~/lib/route-reauth';

export const meta: MetaFunction = ({ matches }) => {
  const rootData = matches.find((match) => match.id === 'root')?.data as { language?: string } | undefined;

  return [{ title: getMfaSetupCopy(rootData?.language)['mfaSetup.metaTitle'] }];
};

type MfaLoaderData = {
  status: 'enabled' | 'reauth' | 'setup';
  language: 'en' | 'fr';
  secret?: string;
  otpauthUrl?: string;
};

/*
 * Replit-style: the QR is ready the instant the page loads — no "generate
 * secret" click. Enrolling a TOTP secret is a security-state change, so the api
 * requires a recent password re-auth (requireRecentReauth). If the session
 * hasn't stepped up yet, we surface a single "confirm your password" screen;
 * once reauthed, the loader re-runs and the QR appears.
 */
export async function loader({ request }: EnterpriseLoaderArgs) {
  const language = resolveMfaSetupLanguage(resolveRequestLocale(request).language);
  const me = await apiRequest<{ user?: { mfaEnabled?: boolean } }>(request, '/auth/me');

  if (me?.user?.mfaEnabled) {
    return json<MfaLoaderData>({ status: 'enabled', language });
  }

  try {
    const setup = await apiRequest<{ secret: string; otpauthUrl: string }>(request, '/auth/mfa/setup', {
      method: 'POST',
      redirectOn401: false,
    });

    return json<MfaLoaderData>({
      status: 'setup',
      language,
      secret: setup.secret,
      otpauthUrl: setup.otpauthUrl,
    });
  } catch (error) {
    if (error instanceof Response && error.status === 403) {
      return json<MfaLoaderData>({ status: 'reauth', language });
    }

    throw error;
  }
}

type MfaActionData = { error?: string; enabled?: boolean; codes?: string[]; message?: string };

export async function action({ request }: EnterpriseActionArgs) {
  const copy = getMfaSetupCopy(resolveRequestLocale(request).language);
  const body = formObject(await request.formData()) as { intent?: string; password?: string; code?: string };

  /*
   * Step-up: confirm the password, then re-run the loader (which now passes the
   * recent-reauth check and creates the secret).
   */
  if (body.intent === 'reauth') {
    try {
      await apiRequest(request, '/auth/reauth', {
        method: 'POST',
        redirectOn401: false,
        body: JSON.stringify({ password: body.password ?? '' }),
      });
    } catch (error) {
      if (error instanceof Response) {
        return json<MfaActionData>({ error: copy['mfaSetup.errors.passwordMismatch'] }, { status: error.status });
      }

      throw error;
    }

    return redirect('/mfa-setup');
  }

  // Verify the 6-digit code → enable MFA → mint recovery codes.
  try {
    await apiRequest(request, '/auth/mfa/verify', {
      method: 'POST',
      redirectOn401: false,
      body: JSON.stringify({ code: (body.code ?? '').replace(/\s/g, '') }),
    });
  } catch (error) {
    if (error instanceof Response) {
      return json<MfaActionData>({ error: copy['mfaSetup.errors.invalidCode'] }, { status: error.status });
    }

    throw error;
  }

  /*
   * MFA is now enabled regardless of whether the recovery-code mint succeeds —
   * don't fail the whole flow if this last call errors. Surface a message
   * pointing the user to /recovery-codes to generate them later.
   */
  try {
    const recovery = await apiRequest<{ codes: string[] }>(request, '/auth/recovery-codes', { method: 'POST' });

    return json<MfaActionData>({ enabled: true, codes: recovery.codes });
  } catch (error) {
    /*
     * The recovery-codes call uses the default redirectOn401:true, so an expired
     * session makes apiRequest throw a login-redirect Response. That must not be
     * caught here — re-throw it so the framework performs the redirect instead of
     * masking it behind the soft "visit /recovery-codes" message.
     */
    if (isReauthRedirect(error)) {
      throw error;
    }

    return json<MfaActionData>({
      enabled: true,
      message: copy['mfaSetup.errors.recoveryCodes'],
    });
  }
}

function CopyButton({ value, copy, label }: { value: string; copy: MfaSetupCopy; label?: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard
          ?.writeText(value)
          .then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          })
          .catch(() => undefined);
      }}
      className="inline-flex min-h-[44px] items-center gap-1.5 whitespace-normal rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2.5 py-1.5 text-left text-xs font-medium text-bolt-elements-textPrimary transition-colors hover:bg-bolt-elements-background-depth-2"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5" style={{ color: 'var(--status-success-text)' }} />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
      {copied ? copy['mfaSetup.copy.copied'] : (label ?? copy['mfaSetup.copy.copy'])}
    </button>
  );
}

function RecoveryCodes({ codes, copy }: { codes: string[]; copy: MfaSetupCopy }) {
  const text = codes.join('\n');

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" data-testid="mfa-recovery-codes">
        {codes.map((code) => (
          <code
            key={code}
            className="break-all rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-center font-mono text-sm tracking-wider text-bolt-elements-textPrimary"
          >
            {code}
          </code>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <CopyButton value={text} copy={copy} label={copy['mfaSetup.copy.all']} />
        <button
          type="button"
          onClick={() => {
            const blob = new Blob([`${copy['mfaSetup.download.heading']}\n\n${text}\n`], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'e-code-recovery-codes.txt';
            a.click();
            URL.revokeObjectURL(url);
          }}
          className="inline-flex min-h-[44px] items-center gap-1.5 whitespace-normal rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2.5 py-1.5 text-left text-xs font-medium text-bolt-elements-textPrimary transition-colors hover:bg-bolt-elements-background-depth-2"
        >
          <Download className="h-3.5 w-3.5" /> {copy['mfaSetup.download']}
        </button>
      </div>
    </div>
  );
}

export default function MfaSetupPage() {
  const loaderData = useLoaderData<typeof loader>() as MfaLoaderData;
  const language = resolveMfaSetupLanguage(loaderData.language);
  const copy = getMfaSetupCopy(language);
  const actionData = useActionData<typeof action>() as MfaActionData | undefined;
  const navigation = useNavigation();
  const isSubmitting = navigation.state === 'submitting';

  // 1) Done — MFA just enabled: show recovery codes (or a fallback if minting failed).
  if (actionData?.enabled) {
    return (
      <EnterpriseFormPage title={copy['mfaSetup.complete.title']} description={copy['mfaSetup.complete.description']}>
        <div className="space-y-6" data-testid="mfa-setup-complete">
          <div
            className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium"
            style={{
              borderColor: 'color-mix(in srgb, var(--status-success-text) 30%, transparent)',
              background: 'color-mix(in srgb, var(--status-success-text) 10%, transparent)',
              color: 'var(--status-success-text)',
            }}
          >
            <ShieldCheck className="h-4 w-4" /> {copy['mfaSetup.complete.badge']}
          </div>
          {actionData.codes ? (
            <div>
              <p className="mb-2 break-words text-sm font-medium text-bolt-elements-textPrimary">
                {copy['mfaSetup.recovery.title']}
              </p>
              <p className="mb-3 break-words text-xs text-bolt-elements-textSecondary">
                {copy['mfaSetup.recovery.description']}
              </p>
              <RecoveryCodes codes={actionData.codes} copy={copy} />
            </div>
          ) : (
            <p className="rounded-md border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-3 py-2 text-sm text-[var(--status-warning-text)]">
              {actionData.message ?? copy['mfaSetup.errors.recoveryCodes']}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <Link
              to="/dashboard"
              className="inline-flex min-h-[44px] items-center justify-center whitespace-normal rounded-md bg-bolt-elements-button-primary-background px-4 py-2 text-center text-sm font-medium text-bolt-elements-button-primary-text hover:opacity-90"
            >
              {copy['mfaSetup.complete.done']}
            </Link>
            <Link
              to="/security-settings"
              className="inline-flex min-h-[44px] items-center justify-center whitespace-normal rounded-md border border-bolt-elements-borderColor px-4 py-2 text-center text-sm font-medium text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-1"
            >
              {copy['mfaSetup.securitySettings']}
            </Link>
          </div>
        </div>
      </EnterpriseFormPage>
    );
  }

  // 2) Already enabled.
  if (loaderData.status === 'enabled') {
    return (
      <EnterpriseFormPage title={copy['mfaSetup.enabled.title']} description={copy['mfaSetup.enabled.description']}>
        <div className="space-y-5">
          <div
            className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium"
            style={{
              borderColor: 'color-mix(in srgb, var(--status-success-text) 30%, transparent)',
              background: 'color-mix(in srgb, var(--status-success-text) 10%, transparent)',
              color: 'var(--status-success-text)',
            }}
          >
            <ShieldCheck className="h-4 w-4" /> {copy['mfaSetup.enabled.badge']}
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/recovery-codes"
              className="inline-flex min-h-[44px] items-center justify-center whitespace-normal rounded-md border border-bolt-elements-borderColor px-4 py-2 text-center text-sm font-medium text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-1"
            >
              {copy['mfaSetup.recovery.title']}
            </Link>
            <Link
              to="/security-settings"
              className="inline-flex min-h-[44px] items-center justify-center whitespace-normal rounded-md border border-bolt-elements-borderColor px-4 py-2 text-center text-sm font-medium text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-1"
            >
              {copy['mfaSetup.enabled.disable']}
            </Link>
          </div>
        </div>
      </EnterpriseFormPage>
    );
  }

  // 3) Step-up: confirm password before enrolling.
  if (loaderData.status === 'reauth') {
    return (
      <EnterpriseFormPage
        title={copy['mfaSetup.reauth.title']}
        description={copy['mfaSetup.reauth.description']}
        error={actionData?.error}
      >
        <Form method="post" className="space-y-4">
          <input type="hidden" name="intent" value="reauth" />
          <label className="block text-sm font-medium text-bolt-elements-textPrimary">
            {copy['mfaSetup.reauth.password']}
            <input
              className="mt-2 w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2.5 text-sm outline-none focus:border-bolt-elements-focus"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              autoFocus
              data-testid="mfa-reauth-password"
            />
          </label>
          <PrimaryButton type="submit" disabled={isSubmitting}>
            {isSubmitting ? copy['mfaSetup.reauth.confirming'] : copy['mfaSetup.reauth.continue']}
          </PrimaryButton>
        </Form>
      </EnterpriseFormPage>
    );
  }

  // 4) Enrollment — one screen: scan the QR, enter the code.
  return (
    <EnterpriseFormPage
      title={copy['mfaSetup.setup.title']}
      description={copy['mfaSetup.setup.description']}
      error={actionData?.error}
    >
      <div className="space-y-6">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          <div
            className="shrink-0 rounded-lg border border-bolt-elements-borderColor bg-white p-3"
            data-testid="mfa-setup-qr"
            aria-label={copy['mfaSetup.setup.qrAria']}
          >
            {loaderData.otpauthUrl ? <QRCode value={loaderData.otpauthUrl} size={172} quietZone={6} /> : null}
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <p className="break-words text-sm font-medium text-bolt-elements-textPrimary">
              {copy['mfaSetup.setup.cannotScan']}
            </p>
            <p className="break-words text-xs text-bolt-elements-textSecondary">{copy['mfaSetup.setup.manual']}</p>
            <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
              <code
                className="min-w-0 flex-1 break-all rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 font-mono text-xs tracking-wider text-bolt-elements-textPrimary"
                data-testid="mfa-setup-secret"
              >
                {loaderData.secret}
              </code>
              <CopyButton value={loaderData.secret ?? ''} copy={copy} />
            </div>
          </div>
        </div>

        <Form method="post" className="space-y-4">
          <input type="hidden" name="intent" value="verify" />
          <label className="block text-sm font-medium text-bolt-elements-textPrimary">
            {copy['mfaSetup.setup.code']}
            <input
              className="mt-2 w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2.5 text-center font-mono text-lg tracking-[0.4em] outline-none focus:border-bolt-elements-focus"
              name="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              minLength={6}
              maxLength={6}
              placeholder="000000"
              required
              autoFocus
              data-testid="mfa-setup-code"
            />
          </label>
          <PrimaryButton type="submit" disabled={isSubmitting}>
            {isSubmitting ? copy['mfaSetup.setup.enabling'] : copy['mfaSetup.setup.enable']}
          </PrimaryButton>
        </Form>
      </div>
    </EnterpriseFormPage>
  );
}
