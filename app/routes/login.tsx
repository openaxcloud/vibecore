import { Form, useActionData } from '@remix-run/react';
import { EnterpriseFormPage, PrimaryButton, TextField } from '~/components/enterprise/EnterpriseFormPage';
import {
  apiRequest,
  formObject,
  redirect,
  sessionCookie,
  type EnterpriseActionArgs,
} from '~/lib/enterprise-api.server';

export async function action({ request }: EnterpriseActionArgs) {
  const body = formObject(await request.formData());
  const result = await apiRequest<{ token: string }>(request, '/auth/login', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  return redirect('/dashboard', { headers: { 'Set-Cookie': sessionCookie(result.token) } });
}

export default function LoginPage() {
  const actionData = useActionData<typeof action>() as { error?: string } | undefined;

  return (
    <EnterpriseFormPage
      title="Login"
      description="Secure email and password access for VibeCore workspaces."
      error={actionData?.error}
    >
      <Form method="post" className="space-y-4">
        <TextField label="Email" name="email" type="email" required />
        <TextField label="Password" name="password" type="password" required />
        <PrimaryButton>Sign in</PrimaryButton>
      </Form>
    </EnterpriseFormPage>
  );
}
