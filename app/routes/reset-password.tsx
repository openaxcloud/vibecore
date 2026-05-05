import { Form, useActionData } from '@remix-run/react';
import { EnterpriseFormPage, PrimaryButton, TextField } from '~/components/enterprise/EnterpriseFormPage';
import { apiRequest, formObject, json, type EnterpriseActionArgs } from '~/lib/enterprise-api.server';

export async function action({ request }: EnterpriseActionArgs) {
  await apiRequest(request, '/auth/password-reset/confirm', {
    method: 'POST',
    body: JSON.stringify(formObject(await request.formData())),
  });
  return json({ ok: true, status: 'Password was reset and existing sessions were revoked.' });
}

export default function ResetPasswordPage() {
  const actionData = useActionData<typeof action>() as { status?: string; error?: string } | undefined;

  return (
    <EnterpriseFormPage
      title="Reset password"
      description="Complete a password reset and revoke existing sessions."
      status={actionData?.status}
      error={actionData?.error}
    >
      <Form method="post" className="space-y-4">
        <TextField label="Reset token" name="token" required />
        <TextField label="New password" name="password" type="password" required />
        <PrimaryButton>Reset password</PrimaryButton>
      </Form>
    </EnterpriseFormPage>
  );
}
