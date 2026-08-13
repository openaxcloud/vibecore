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
import { isReauthRedirect } from '~/lib/route-reauth';

export const meta: MetaFunction = () => [{ title: 'Two-factor authentication - E-Code' }];

type MfaLoaderData = { status: 'enabled' | 'reauth' | 'setup'; secret?: string; otpauthUrl?: string };

/*
 * Replit-style: the QR is ready the instant the page loads — no "generate
 * secret" click. Enrolling a TOTP secret is a security-state change, so the api
 * requires a recent password re-auth (requireRecentReauth). If the session
 * hasn't stepped up yet, we surface a single "confirm your password" screen;
 * once reauthed, the loader re-runs and the QR appears.
 */
export async function loader({ request }: EnterpriseLoaderArgs) {
  const me = await apiRequest<{ user?: { mfaEnabled?: boolean } }>(request, '/auth/me');

  if (me?.user?.mfaEnabled) {
    return json<MfaLoaderData>({ status: 'enabled' });
  }

  try {
    const setup = await apiRequest<{ secret: string; otpauthUrl: string }>(request, '/auth/mfa/setup', {
      method: 'POST',
      redirectOn401: false,
    });

    return json<MfaLoaderData>({ status: 'setup', secret: setup.secret, otpauthUrl: setup.otpauthUrl });
  } catch (error) {
    if (error instanceof Response && error.status === 403) {
      return json<MfaLoaderData>({ status: 'reauth' });
    }

    throw error;
  }
}

type MfaActionData = { error?: string; enabled?: boolean; codes?: string[]; message?: string };

export async function action({ request }: EnterpriseActionArgs) {
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
        return json<MfaActionData>({ error: 'That password didn’t match. Try again.' }, { status: error.status });
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
      let message = 'That code didn’t match — check your authenticator app and try again.';

      try {
        const payload = (await error.clone().json()) as { error?: string };
        message = payload.error ?? message;
      } catch {
        message = error.statusText || message;
      }

      return json<MfaActionData>({ error: message }, { status: error.status });
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
      message:
        'Two-factor authentication is on, but we couldn’t generate recovery codes. Visit /recovery-codes to create them.',
    });
  }
}

function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
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
      className="inline-flex items-center gap-1.5 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2.5 py-1.5 text-xs font-medium text-bolt-elements-textPrimary transition-colors hover:bg-bolt-elements-background-depth-2"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5" style={{ color: 'var(--status-success-text)' }} />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
      {copied ? 'Copied' : label}
    </button>
  );
}

function RecoveryCodes({ codes }: { codes: string[] }) {
  const text = codes.join('\n');

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2" data-testid="mfa-recovery-codes">
        {codes.map((code) => (
          <code
            key={code}
            className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-center font-mono text-sm tracking-wider text-bolt-elements-textPrimary"
          >
            {code}
          </code>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <CopyButton value={text} label="Copy all" />
        <button
          type="button"
          onClick={() => {
            const blob = new Blob([`E-Code recovery codes\n\n${text}\n`], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'e-code-recovery-codes.txt';
            a.click();
            URL.revokeObjectURL(url);
          }}
          className="inline-flex items-center gap-1.5 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2.5 py-1.5 text-xs font-medium text-bolt-elements-textPrimary transition-colors hover:bg-bolt-elements-background-depth-2"
        >
          <Download className="h-3.5 w-3.5" /> Download
        </button>
      </div>
    </div>
  );
}

export default function MfaSetupPage() {
  const loaderData = useLoaderData<typeof loader>() as MfaLoaderData;
  const actionData = useActionData<typeof action>() as MfaActionData | undefined;
  const navigation = useNavigation();
  const isSubmitting = navigation.state === 'submitting';

  // 1) Done — MFA just enabled: show recovery codes (or a fallback if minting failed).
  if (actionData?.enabled) {
    return (
      <EnterpriseFormPage
        title="Two-factor authentication is on"
        description="Save your recovery codes — each works once if you ever lose your authenticator."
      >
        <div className="space-y-6" data-testid="mfa-setup-complete">
          <div
            className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium"
            style={{
              borderColor: 'color-mix(in srgb, var(--status-success-text) 30%, transparent)',
              background: 'color-mix(in srgb, var(--status-success-text) 10%, transparent)',
              color: 'var(--status-success-text)',
            }}
          >
            <ShieldCheck className="h-4 w-4" /> Two-factor authentication enabled
          </div>
          {actionData.codes ? (
            <div>
              <p className="mb-2 text-sm font-medium text-bolt-elements-textPrimary">Recovery codes</p>
              <p className="mb-3 text-xs text-bolt-elements-textSecondary">
                Store these in your password manager. Each can be used once if you lose access to your authenticator.
              </p>
              <RecoveryCodes codes={actionData.codes} />
            </div>
          ) : (
            <p className="rounded-md border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-3 py-2 text-sm text-[var(--status-warning-text)]">
              {actionData.message ??
                'Two-factor authentication is on, but we couldn’t generate recovery codes. Visit /recovery-codes to create them.'}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <Link
              to="/dashboard"
              className="inline-flex items-center justify-center rounded-md bg-bolt-elements-button-primary-background px-4 py-2 text-sm font-medium text-bolt-elements-button-primary-text hover:opacity-90"
            >
              Done
            </Link>
            <Link
              to="/security-settings"
              className="inline-flex items-center justify-center rounded-md border border-bolt-elements-borderColor px-4 py-2 text-sm font-medium text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-1"
            >
              Security settings
            </Link>
          </div>
        </div>
      </EnterpriseFormPage>
    );
  }

  // 2) Already enabled.
  if (loaderData.status === 'enabled') {
    return (
      <EnterpriseFormPage
        title="Two-factor authentication"
        description="Your account is protected with an authenticator app."
      >
        <div className="space-y-5">
          <div
            className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium"
            style={{
              borderColor: 'color-mix(in srgb, var(--status-success-text) 30%, transparent)',
              background: 'color-mix(in srgb, var(--status-success-text) 10%, transparent)',
              color: 'var(--status-success-text)',
            }}
          >
            <ShieldCheck className="h-4 w-4" /> Two-factor authentication is enabled
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/recovery-codes"
              className="inline-flex items-center justify-center rounded-md border border-bolt-elements-borderColor px-4 py-2 text-sm font-medium text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-1"
            >
              Recovery codes
            </Link>
            <Link
              to="/security-settings"
              className="inline-flex items-center justify-center rounded-md border border-bolt-elements-borderColor px-4 py-2 text-sm font-medium text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-1"
            >
              Disable in Security settings
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
        title="Confirm your password"
        description="For your security, confirm your password before setting up two-factor authentication."
        error={actionData?.error}
      >
        <Form method="post" className="space-y-4">
          <input type="hidden" name="intent" value="reauth" />
          <label className="block text-sm font-medium text-bolt-elements-textPrimary">
            Password
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
            {isSubmitting ? 'Confirming…' : 'Continue'}
          </PrimaryButton>
        </Form>
      </EnterpriseFormPage>
    );
  }

  // 4) Enrollment — one screen: scan the QR, enter the code.
  return (
    <EnterpriseFormPage
      title="Set up two-factor authentication"
      description="Scan the QR code with an authenticator app (Google Authenticator, 1Password, Authy…), then enter the 6-digit code."
      error={actionData?.error}
    >
      <div className="space-y-6">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          <div
            className="shrink-0 rounded-lg border border-bolt-elements-borderColor bg-white p-3"
            data-testid="mfa-setup-qr"
          >
            {loaderData.otpauthUrl ? <QRCode value={loaderData.otpauthUrl} size={172} quietZone={6} /> : null}
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-sm font-medium text-bolt-elements-textPrimary">Can’t scan it?</p>
            <p className="text-xs text-bolt-elements-textSecondary">
              Enter this setup key manually in your authenticator app.
            </p>
            <div className="flex items-center gap-2">
              <code
                className="min-w-0 flex-1 truncate rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 font-mono text-xs tracking-wider text-bolt-elements-textPrimary"
                data-testid="mfa-setup-secret"
              >
                {loaderData.secret}
              </code>
              <CopyButton value={loaderData.secret ?? ''} />
            </div>
          </div>
        </div>

        <Form method="post" className="space-y-4">
          <input type="hidden" name="intent" value="verify" />
          <label className="block text-sm font-medium text-bolt-elements-textPrimary">
            6-digit code
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
            {isSubmitting ? 'Enabling…' : 'Enable two-factor authentication'}
          </PrimaryButton>
        </Form>
      </div>
    </EnterpriseFormPage>
  );
}
