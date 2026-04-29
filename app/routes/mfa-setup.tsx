import { Form, useActionData } from '@remix-run/react';
import { EnterpriseFormPage, PrimaryButton, TextField } from '~/components/enterprise/EnterpriseFormPage';
import { apiRequest, formObject, json, type EnterpriseActionArgs } from '~/lib/enterprise-api.server';

export async function action({ request }: EnterpriseActionArgs) {
  const body = formObject(await request.formData()) as { code?: string; intent?: string };

  if (body.intent === 'setup') {
    const setup = await apiRequest<{ secret: string; otpauthUrl: string }>(request, '/auth/mfa/setup', {
      method: 'POST',
    });
    return json({ status: 'MFA secret generated.', secret: setup.secret, otpauthUrl: setup.otpauthUrl });
  }

  await apiRequest(request, '/auth/mfa/verify', { method: 'POST', body: JSON.stringify({ code: body.code }) });

  return json({ status: 'MFA enabled.' });
}

export default function MfaSetupPage() {
  const actionData = useActionData<typeof action>() as
    | { status?: string; error?: string; secret?: string; otpauthUrl?: string }
    | undefined;

  return (
    <EnterpriseFormPage
      title="MFA setup"
      description="Enroll a TOTP authenticator for administrator-grade account protection."
      status={actionData?.status}
      error={actionData?.error}
    >
      <Form method="post" className="mb-6">
        <PrimaryButton>Generate secret</PrimaryButton>
        <input type="hidden" name="intent" value="setup" />
      </Form>
      {actionData?.secret ? (
        <pre className="mb-6 overflow-auto rounded-md border border-bolt-elements-borderColor p-3 text-xs">
          {actionData.otpauthUrl}
        </pre>
      ) : null}
      <Form method="post" className="space-y-4">
        <TextField label="Authenticator code" name="code" required />
        <PrimaryButton>Enable MFA</PrimaryButton>
      </Form>
    </EnterpriseFormPage>
  );
}
