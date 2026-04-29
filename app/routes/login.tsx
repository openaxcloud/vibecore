import { Form, useActionData, useNavigation } from '@remix-run/react';
import { EnterpriseFormPage, PrimaryButton, TextField } from '~/components/enterprise/EnterpriseFormPage';
import {
  apiRequest,
  formObject,
  json,
  redirect,
  sessionCookie,
  type EnterpriseActionArgs,
} from '~/lib/enterprise-api.server';

export async function action({ request }: EnterpriseActionArgs) {
  const body = formObject(await request.formData());

  try {
    const result = await apiRequest<{ token: string }>(request, '/auth/login', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    return redirect('/dashboard', { headers: { 'Set-Cookie': sessionCookie(result.token) } });
  } catch (error) {
    if (error instanceof Response) {
      let message = 'Login failed';

      try {
        const payload = (await error.json()) as { error?: string };
        message = payload.error ?? message;
      } catch {
        message = error.statusText || message;
      }

      return json({ error: message }, { status: error.status });
    }

    return json({ error: 'Login failed. Check that the API service is running.' }, { status: 503 });
  }
}

export default function LoginPage() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === 'submitting';

  return (
    <EnterpriseFormPage
      title="Login"
      description="Secure email and password access for VibeCore workspaces."
      error={actionData?.error}
    >
      <Form method="post" className="space-y-4">
        <TextField label="Email" name="email" type="email" required />
        <TextField label="Password" name="password" type="password" required />
        <PrimaryButton type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Signing in...' : 'Sign in'}
        </PrimaryButton>
      </Form>
    </EnterpriseFormPage>
  );
}
