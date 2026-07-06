import { KeyRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Form, Link, useActionData, useNavigation, useSearchParams } from 'react-router';
import { AuthField, AuthScreen, AuthSubmit } from '~/components/auth/AuthScreen';
import { apiRequest, formObject, json, type EnterpriseActionArgs } from '~/lib/enterprise-api.server';
import { isReauthRedirect } from '~/lib/route-reauth';

export async function action({ request }: EnterpriseActionArgs) {
  const body = formObject(await request.formData());

  try {
    if (body.intent === 'resend') {
      /*
       * Re-issues a fresh token and emails it. Requires the just-registered session (signup logs the
       * user in), and is rate-limited to 5/min on the API. In non-production the API echoes the token.
       */
      const result = await apiRequest<{ alreadyVerified?: boolean; verificationToken?: string }>(
        request,
        '/auth/send-verification',
        { method: 'POST', redirectOn401: false, body: JSON.stringify({}) },
      );

      if (result.alreadyVerified) {
        return json({ status: 'This email is already verified — you can continue using E-code.' });
      }

      return json({
        status: result.verificationToken
          ? `A new verification email was sent. Dev token: ${result.verificationToken}`
          : 'A new verification email is on its way. Check your inbox (and spam).',
      });
    }

    await apiRequest(request, '/auth/verify-email', {
      method: 'POST',
      redirectOn401: false,
      body: JSON.stringify(body),
    });

    return json({ status: 'Email verified. You can close this tab and continue using E-code.' });
  } catch (error) {
    /*
     * A 3xx re-auth redirect (e.g. apiRequest throws `redirect('/mfa-setup')` when the
     * API answers a page-navigation POST with 403 MFA_REQUIRED) must be re-thrown so the
     * framework performs the redirect, not swallowed into a generic inline error.
     */
    if (isReauthRedirect(error)) {
      throw error;
    }

    if (error instanceof Response) {
      let message = 'Verification failed.';

      try {
        const payload = (await error.json()) as { error?: string };
        message = payload.error ?? message;
      } catch {
        message = error.statusText || message;
      }

      return json({ error: message }, { status: error.status });
    }

    return json({ error: 'Verification service is not reachable. Please try again in a moment.' }, { status: 503 });
  }
}

export default function VerifyEmailPage() {
  const actionData = useActionData<typeof action>() as { status?: string; error?: string } | undefined;
  const navigation = useNavigation();
  const isSubmitting = navigation.state === 'submitting';

  /*
   * Tokens emailed to users are long opaque strings — typing them by
   * hand is a usability tax. Accept `?token=...` from the verification
   * link so the field is pre-filled and the user only has to click
   * "Verify email".
   */
  const [searchParams] = useSearchParams();
  const tokenFromUrl = searchParams.get('token') ?? '';

  /*
   * Client-side 60s cooldown on resend so users can't hammer the button (the API
   * also throttles 5/min). Starts on each resend submit; a 1s tick drives the
   * countdown label.
   */
  const [cooldownEndsAt, setCooldownEndsAt] = useState(0);
  const [nowTs, setNowTs] = useState(() => Date.now());

  useEffect(() => {
    if (cooldownEndsAt <= Date.now()) {
      return undefined;
    }

    const timer = setInterval(() => setNowTs(Date.now()), 1000);

    return () => clearInterval(timer);
  }, [cooldownEndsAt]);

  const resendSecondsLeft = cooldownEndsAt > nowTs ? Math.ceil((cooldownEndsAt - nowTs) / 1000) : 0;

  return (
    <AuthScreen
      eyebrow="Verify your email"
      title="Confirm your email"
      description="Paste the verification token from the email we sent you, or click the verification link directly."
      status={actionData?.status}
      error={actionData?.error}
      heroEyebrow="One last step"
      heroTitle="Unlock your full workspace"
      heroBody="Verifying your email enables team invites, deploy notifications and billing receipts."
      footer={
        <>
          Didn&apos;t get the email? Use <span className="font-semibold">Resend verification email</span> above, or{' '}
          <Link to="/login" className="vc-auth-link font-semibold hover:underline">
            sign in
          </Link>{' '}
          from another device.
        </>
      }
    >
      <Form method="post" className="space-y-4 sm:space-y-5">
        <AuthField
          label="Verification token"
          name="token"
          required
          minLength={16}
          defaultValue={tokenFromUrl}
          placeholder="verify_..."
          autoComplete="one-time-code"
          icon={<KeyRound className="h-4 w-4" />}
          hint="The token expires 24 hours after registration."
        />
        <AuthSubmit label="Verify email" loadingLabel="Verifying..." isSubmitting={isSubmitting} />
      </Form>
      <Form method="post" className="mt-3" onSubmit={() => setCooldownEndsAt(Date.now() + 60_000)}>
        <input type="hidden" name="intent" value="resend" />
        <button
          type="submit"
          disabled={isSubmitting || resendSecondsLeft > 0}
          className="vc-auth-link text-sm font-semibold hover:underline disabled:opacity-60"
        >
          {resendSecondsLeft > 0 ? `Resend available in ${resendSecondsLeft}s` : 'Resend verification email'}
        </button>
      </Form>
    </AuthScreen>
  );
}
