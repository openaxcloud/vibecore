import { Mail } from 'lucide-react';
import { Form, Link, useActionData, useNavigation } from 'react-router';
import { AuthField, AuthScreen, AuthSubmit } from '~/components/auth/AuthScreen';
import { apiRequest, formObject, json, type EnterpriseActionArgs } from '~/lib/enterprise-api.server';

export async function action({ request }: EnterpriseActionArgs) {
  const body = formObject(await request.formData());

  try {
    await apiRequest(request, '/auth/password-reset/request', {
      method: 'POST',
      redirectOn401: false,
      body: JSON.stringify(body),
    });

    /*
     * Intentionally identical message whether or not the email matches a
     * real account — leaking that information would let attackers
     * enumerate registered emails through this endpoint.
     */
    return json({ status: 'If an account exists for that email, we just sent reset instructions.' });
  } catch (error) {
    if (error instanceof Response) {
      let message = 'Could not start the password reset.';

      try {
        const payload = (await error.json()) as { error?: string };
        message = payload.error ?? message;
      } catch {
        message = error.statusText || message;
      }

      return json({ error: message }, { status: error.status });
    }

    return json({ error: 'Password reset service is not reachable. Please try again in a moment.' }, { status: 503 });
  }
}

export default function ForgotPasswordPage() {
  const actionData = useActionData<typeof action>() as { status?: string; error?: string } | undefined;
  const navigation = useNavigation();
  const isSubmitting = navigation.state === 'submitting';

  return (
    <AuthScreen
      eyebrow="Reset your password"
      title="Forgot your password?"
      description="Enter the email on your account and we will send a time-limited reset link."
      status={actionData?.status}
      error={actionData?.error}
      heroEyebrow="Secure recovery"
      heroTitle="We never store your password in plain text"
      heroBody="Reset links expire after 30 minutes and existing sessions are revoked once you choose a new password."
      footer={
        <>
          Remembered it?{' '}
          <Link to="/login" className="vc-auth-link font-semibold hover:underline">
            Back to sign in
          </Link>
        </>
      }
    >
      <Form method="post" className="space-y-4 sm:space-y-5">
        <AuthField
          label="Email"
          name="email"
          type="email"
          required
          placeholder="you@company.com"
          autoComplete="email"
          icon={<Mail className="h-4 w-4" />}
        />
        <AuthSubmit label="Send reset link" loadingLabel="Sending..." isSubmitting={isSubmitting} />
      </Form>
    </AuthScreen>
  );
}
