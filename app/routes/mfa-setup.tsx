import { Form, useActionData, useNavigation } from '@remix-run/react';
import { QRCode } from 'react-qrcode-logo';
import { EnterpriseFormPage, PrimaryButton, TextField } from '~/components/enterprise/EnterpriseFormPage';
import { apiRequest, formObject, json, redirect, type EnterpriseActionArgs } from '~/lib/enterprise-api.server';

export async function action({ request }: EnterpriseActionArgs) {
  const body = formObject(await request.formData()) as {
    code?: string;
    intent?: string;
    secret?: string;
    otpauthUrl?: string;
  };

  if (body.intent === 'setup') {
    const setup = await apiRequest<{ secret: string; otpauthUrl: string }>(request, '/auth/mfa/setup', {
      method: 'POST',
    });
    return json({ status: 'MFA secret generated.', secret: setup.secret, otpauthUrl: setup.otpauthUrl });
  }

  try {
    await apiRequest(request, '/auth/mfa/verify', { method: 'POST', body: JSON.stringify({ code: body.code }) });
  } catch (error) {
    if (error instanceof Response) {
      let message = 'Invalid MFA code';

      try {
        const payload = (await error.json()) as { error?: string };
        message = payload.error ?? message;
      } catch {
        message = error.statusText || message;
      }

      return json(
        {
          error: message,
          secret: body.secret,
          otpauthUrl: body.otpauthUrl,
        },
        { status: error.status },
      );
    }

    throw error;
  }

  return redirect('/dashboard');
}

export default function MfaSetupPage() {
  const actionData = useActionData<typeof action>() as
    | { status?: string; error?: string; secret?: string; otpauthUrl?: string }
    | undefined;

  const navigation = useNavigation();
  const submittingIntent = navigation.formData?.get('intent');
  const isGenerating = navigation.state === 'submitting' && submittingIntent === 'setup';
  const isVerifying = navigation.state === 'submitting' && submittingIntent === 'verify';

  return (
    <EnterpriseFormPage
      title="MFA setup"
      description="Enroll a TOTP authenticator for administrator-grade account protection."
      status={actionData?.status}
      error={actionData?.error}
    >
      <Form method="post" className="mb-6">
        <PrimaryButton type="submit" disabled={isGenerating || isVerifying}>
          {isGenerating ? 'Generating...' : 'Generate secret'}
        </PrimaryButton>
        <input type="hidden" name="intent" value="setup" />
      </Form>
      {actionData?.secret ? (
        <div className="mb-6 space-y-4">
          {actionData.otpauthUrl ? (
            <div className="flex justify-center rounded-md border border-bolt-elements-borderColor bg-white p-4">
              <QRCode value={actionData.otpauthUrl} size={180} quietZone={8} />
            </div>
          ) : null}
          <div>
            <p className="mb-2 text-sm font-medium text-bolt-elements-textPrimary">Manual setup secret</p>
            <pre className="overflow-auto rounded-md border border-bolt-elements-borderColor p-3 text-xs">
              {actionData.secret}
            </pre>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-bolt-elements-textPrimary">Full authenticator URL</p>
            <pre className="overflow-auto rounded-md border border-bolt-elements-borderColor p-3 text-xs">
              {actionData.otpauthUrl}
            </pre>
          </div>
        </div>
      ) : null}
      <Form method="post" className="space-y-4">
        <input type="hidden" name="intent" value="verify" />
        <input type="hidden" name="secret" value={actionData?.secret ?? ''} />
        <input type="hidden" name="otpauthUrl" value={actionData?.otpauthUrl ?? ''} />
        <TextField label="6-digit authenticator code" name="code" required />
        <PrimaryButton type="submit" disabled={isGenerating || isVerifying}>
          {isVerifying ? 'Enabling MFA...' : 'Enable MFA'}
        </PrimaryButton>
      </Form>
    </EnterpriseFormPage>
  );
}
