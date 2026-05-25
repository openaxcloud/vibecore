import { Form, Link, useActionData, useNavigation, useSearchParams } from '@remix-run/react';
import { KeyRound } from 'lucide-react';
import { AuthField, AuthScreen, AuthSubmit } from '~/components/auth/AuthScreen';
import { apiRequest, formObject, json, type EnterpriseActionArgs } from '~/lib/enterprise-api.server';

export async function action({ request }: EnterpriseActionArgs) {
  const body = formObject(await request.formData());

  try {
    await apiRequest(request, '/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    return json({ status: 'Email verified. You can close this tab and continue using E-code.' });
  } catch (error) {
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
          Need a new code?{' '}
          <Link to="/login" className="vc-auth-link font-semibold hover:underline">
            Sign in
          </Link>{' '}
          to request another.
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
    </AuthScreen>
  );
}
