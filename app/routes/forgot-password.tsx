import { Form, useActionData } from '@remix-run/react';
import { EnterpriseFormPage, PrimaryButton, TextField } from '~/components/enterprise/EnterpriseFormPage';
import { apiRequest, formObject, json, type EnterpriseActionArgs } from '~/lib/enterprise-api.server';

export async function action({ request }: EnterpriseActionArgs) {
  await apiRequest(request, '/auth/password-reset/request', {
    method: 'POST',
    body: JSON.stringify(formObject(await request.formData())),
  });
  return json({ ok: true, status: 'Password reset instructions were sent if the account exists.' });
}

export default function ForgotPasswordPage() {
  const actionData = useActionData<typeof action>() as { status?: string; error?: string } | undefined;

  return (
    <EnterpriseFormPage
      title="Forgot password"
      description="Start a time-limited password reset flow."
      status={actionData?.status}
      error={actionData?.error}
    >
      <Form method="post" className="space-y-4">
        <TextField label="Email" name="email" type="email" required />
        <PrimaryButton>Send reset link</PrimaryButton>
      </Form>
    </EnterpriseFormPage>
  );
}
