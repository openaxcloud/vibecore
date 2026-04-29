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
  const result = await apiRequest<{ token: string }>(request, '/auth/register', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  return redirect('/verify-email', { headers: { 'Set-Cookie': sessionCookie(result.token) } });
}

export default function SignupPage() {
  const actionData = useActionData<typeof action>() as { error?: string } | undefined;

  return (
    <EnterpriseFormPage
      title="Signup"
      description="Create a user account and the first organization workspace."
      error={actionData?.error}
    >
      <Form method="post" className="space-y-4">
        <TextField label="Name" name="name" />
        <TextField label="Organization" name="organizationName" required />
        <TextField label="Email" name="email" type="email" required />
        <TextField label="Password" name="password" type="password" required />
        <PrimaryButton>Create account</PrimaryButton>
      </Form>
    </EnterpriseFormPage>
  );
}
