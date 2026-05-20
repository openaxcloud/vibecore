import type { MetaFunction } from '@remix-run/cloudflare';
import { Form, Link, useActionData, useNavigation } from '@remix-run/react';
import { QRCode } from 'react-qrcode-logo';
import { EnterpriseFormPage, PrimaryButton } from '~/components/enterprise/EnterpriseFormPage';
import { apiRequest, formObject, json, type EnterpriseActionArgs } from '~/lib/enterprise-api.server';

export const meta: MetaFunction = () => [{ title: 'MFA setup - VibeCore' }];

export type MfaSetupActionData = {
  status?: string;
  error?: string;
  secret?: string;
  otpauthUrl?: string;
  codes?: string[];
  enabled?: boolean;
};

export async function action({ request }: EnterpriseActionArgs) {
  const body = formObject(await request.formData()) as {
    code?: string;
    intent?: string;
    secret?: string;
    otpauthUrl?: string;
  };

  if (body.intent === 'setup') {
    const setup = await apiRequest<{ secret: string; otpauthUrl: string }>(request, '/auth/mfa/setup', {
      method: 'POST',
    });

    return json<MfaSetupActionData>({
      status: 'Scan the QR code with your authenticator app, then enter the 6-digit code below.',
      secret: setup.secret,
      otpauthUrl: setup.otpauthUrl,
    });
  }

  if (body.intent === 'verify') {
    try {
      await apiRequest(request, '/auth/mfa/verify', {
        method: 'POST',
        body: JSON.stringify({ code: body.code }),
      });
    } catch (error) {
      if (error instanceof Response) {
        let message = 'Invalid MFA code';

        try {
          const payload = (await error.clone().json()) as { error?: string };
          message = payload.error ?? message;
        } catch {
          message = error.statusText || message;
        }

        return json<MfaSetupActionData>(
          {
            error: message,
            secret: body.secret,
            otpauthUrl: body.otpauthUrl,
          },
          { status: error.status },
        );
      }

      throw error;
    }

    /*
     * Recovery codes are minted automatically after the first successful
     * TOTP verification so the user leaves /mfa-setup with both factors
     * configured. The /recovery-codes route remains available for later
     * rotation, but a fresh enrollment without backup codes would leave a
     * locked-out user with no way back in if they lost their device.
     */
    const recovery = await apiRequest<{ codes: string[] }>(request, '/auth/recovery-codes', {
      method: 'POST',
    });

    return json<MfaSetupActionData>({
      status: 'MFA enabled. Save these recovery codes — each can be used once if you lose your authenticator.',
      enabled: true,
      codes: recovery.codes,
    });
  }

  return json<MfaSetupActionData>({ error: 'Unknown form submission.' }, { status: 400 });
}

export default function MfaSetupPage() {
  const actionData = useActionData<typeof action>() as MfaSetupActionData | undefined;

  const navigation = useNavigation();
  const submittingIntent = navigation.formData?.get('intent');
  const isGenerating = navigation.state === 'submitting' && submittingIntent === 'setup';
  const isVerifying = navigation.state === 'submitting' && submittingIntent === 'verify';

  const enrolled = actionData?.enabled === true;
  const codes = actionData?.codes;
  const secret = actionData?.secret;
  const otpauthUrl = actionData?.otpauthUrl;

  return (
    <EnterpriseFormPage
      title="MFA setup"
      description="Enroll a TOTP authenticator and save recovery codes to protect your account."
      status={actionData?.status}
      error={actionData?.error}
    >
      {enrolled ? (
        <div className="space-y-6" data-testid="mfa-setup-complete">
          <div>
            <p className="mb-2 text-sm font-medium text-bolt-elements-textPrimary">Your recovery codes</p>
            <p className="mb-3 text-xs text-bolt-elements-textSecondary">
              Store these somewhere safe — a password manager or printed copy. Each code can only be used once if you
              lose access to your authenticator.
            </p>
            <pre
              className="overflow-auto rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-3 text-xs"
              data-testid="mfa-recovery-codes"
            >
              {codes?.join('\n')}
            </pre>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/dashboard"
              className="inline-flex items-center justify-center rounded-md bg-bolt-elements-button-primary-background px-4 py-2 text-sm font-medium text-bolt-elements-button-primary-text hover:opacity-90"
            >
              Continue to dashboard
            </Link>
            <Link
              to="/recovery-codes"
              className="inline-flex items-center justify-center rounded-md border border-bolt-elements-borderColor px-4 py-2 text-sm font-medium text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-1"
            >
              Manage recovery codes
            </Link>
          </div>
        </div>
      ) : (
        <>
          <Form method="post" className="mb-6">
            <input type="hidden" name="intent" value="setup" />
            <PrimaryButton type="submit" disabled={isGenerating || isVerifying}>
              {secret ? (isGenerating ? 'Regenerating...' : 'Regenerate secret') : isGenerating ? 'Generating...' : 'Generate secret'}
            </PrimaryButton>
          </Form>
          {secret ? (
            <>
              <div className="mb-6 space-y-4">
                {otpauthUrl ? (
                  <div
                    className="flex justify-center rounded-md border border-bolt-elements-borderColor bg-white p-4"
                    data-testid="mfa-setup-qr"
                  >
                    <QRCode value={otpauthUrl} size={180} quietZone={8} />
                  </div>
                ) : null}
                <div>
                  <p className="mb-2 text-sm font-medium text-bolt-elements-textPrimary">
                    Can&apos;t scan? Enter this secret manually
                  </p>
                  <pre
                    className="overflow-auto rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-3 text-xs"
                    data-testid="mfa-setup-secret"
                  >
                    {secret}
                  </pre>
                </div>
              </div>
              <Form method="post" className="space-y-4">
                <input type="hidden" name="intent" value="verify" />
                <input type="hidden" name="secret" value={secret} />
                <input type="hidden" name="otpauthUrl" value={otpauthUrl ?? ''} />
                <label className="block text-sm font-medium">
                  6-digit authenticator code
                  <input
                    className="mt-2 w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 font-mono text-sm tracking-widest outline-none focus:border-bolt-elements-focus"
                    name="code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="\d{6}"
                    minLength={6}
                    maxLength={6}
                    required
                    autoFocus
                    data-testid="mfa-setup-code"
                  />
                </label>
                <PrimaryButton type="submit" disabled={isGenerating || isVerifying}>
                  {isVerifying ? 'Enabling MFA...' : 'Enable MFA'}
                </PrimaryButton>
              </Form>
            </>
          ) : null}
        </>
      )}
    </EnterpriseFormPage>
  );
}
