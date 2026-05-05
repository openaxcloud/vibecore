import { Form, useActionData } from '@remix-run/react';
import { EnterpriseFormPage, PrimaryButton, TextField } from '~/components/enterprise/EnterpriseFormPage';
import { apiRequest, formObject, json, type EnterpriseActionArgs } from '~/lib/enterprise-api.server';

export async function action({ request }: EnterpriseActionArgs) {
  await apiRequest(request, '/auth/verify-email', {
    method: 'POST',
    body: JSON.stringify(formObject(await request.formData())),
  });
  return json({ status: 'Email verified.' });
}

export default function VerifyEmailPage() {
  const actionData = useActionData<typeof action>() as { status?: string; error?: string } | undefined;

  return (
    <EnterpriseFormPage
      title="Verify email"
      description="Confirm ownership of an email address before enterprise access is granted."
      status={actionData?.status}
      error={actionData?.error}
    >
      <Form method="post" className="space-y-4">
        <TextField label="Verification token" name="token" required />
        <PrimaryButton>Verify email</PrimaryButton>
      </Form>
    </EnterpriseFormPage>
  );
}
