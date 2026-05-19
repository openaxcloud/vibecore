import { Form, Link, useActionData, useNavigation, useSearchParams } from '@remix-run/react';
import { KeyRound, Lock } from 'lucide-react';
import { AuthField, AuthScreen, AuthSubmit } from '~/components/auth/AuthScreen';
import { apiRequest, formObject, json, type EnterpriseActionArgs } from '~/lib/enterprise-api.server';

export async function action({ request }: EnterpriseActionArgs) {
  const body = formObject(await request.formData());
  const token = typeof body.token === 'string' ? body.token : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const confirmPassword = typeof body.confirmPassword === 'string' ? body.confirmPassword : '';

  if (password.length < 8) {
    return json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
  }

  if (password !== confirmPassword) {
    return json({ error: 'Passwords do not match.' }, { status: 400 });
  }

  try {
    await apiRequest(request, '/auth/password-reset/confirm', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    });

    return json({ status: 'Your password was reset and existing sessions were revoked. You can now sign in.' });
  } catch (error) {
    if (error instanceof Response) {
      let message = 'Could not reset your password.';

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

export default function ResetPasswordPage() {
  const actionData = useActionData<typeof action>() as { status?: string; error?: string } | undefined;
  const navigation = useNavigation();
  const isSubmitting = navigation.state === 'submitting';

  const [searchParams] = useSearchParams();
  const tokenFromUrl = searchParams.get('token') ?? '';

  return (
    <AuthScreen
      eyebrow="Choose a new password"
      title="Reset your password"
      description="Pick a fresh password — all your existing sessions will be signed out once it's saved."
      status={actionData?.status}
      error={actionData?.error}
      heroEyebrow="Secure recovery"
      heroTitle="One strong password unlocks your workspace"
      heroBody="We hash every password with scrypt + a unique salt and never log it. Old sessions are revoked the moment you submit."
      footer={
        <>
          Done?{' '}
          <Link to="/login" className="font-semibold text-[#7B61FF] hover:underline">
            Sign in with your new password
          </Link>
        </>
      }
    >
      <Form method="post" className="space-y-4 sm:space-y-5">
        <AuthField
          label="Reset token"
          name="token"
          required
          minLength={16}
          defaultValue={tokenFromUrl}
          placeholder="reset_..."
          autoComplete="one-time-code"
          icon={<KeyRound className="h-4 w-4" />}
        />
        <AuthField
          label="New password"
          name="password"
          type="password"
          required
          minLength={8}
          placeholder="At least 8 characters"
          autoComplete="new-password"
          icon={<Lock className="h-4 w-4" />}
        />
        <AuthField
          label="Confirm new password"
          name="confirmPassword"
          type="password"
          required
          minLength={8}
          placeholder="Re-enter the same password"
          autoComplete="new-password"
          icon={<Lock className="h-4 w-4" />}
        />
        <AuthSubmit label="Reset password" loadingLabel="Resetting..." isSubmitting={isSubmitting} />
      </Form>
    </AuthScreen>
  );
}
