import { Form, useActionData } from 'react-router';
import { EnterpriseFormPage, PrimaryButton } from '~/components/enterprise/EnterpriseFormPage';
import { apiRequest, json, type EnterpriseActionArgs } from '~/lib/enterprise-api.server';

export async function action({ request }: EnterpriseActionArgs) {
  const result = await apiRequest<{ codes: string[] }>(request, '/auth/recovery-codes', { method: 'POST' });
  return json({ status: 'Recovery codes rotated.', codes: result.codes });
}

export default function RecoveryCodesPage() {
  const actionData = useActionData<typeof action>() as
    | { status?: string; error?: string; codes?: string[] }
    | undefined;

  return (
    <EnterpriseFormPage
      title="Recovery codes"
      description="Rotate one-time account recovery codes for MFA fallback."
      status={actionData?.status}
      error={actionData?.error}
    >
      <Form
        method="post"
        onSubmit={(event) => {
          if (
            !window.confirm(
              'Generating new recovery codes permanently invalidates all of your existing codes. Continue?',
            )
          ) {
            event.preventDefault();
          }
        }}
      >
        <PrimaryButton>Generate recovery codes</PrimaryButton>
      </Form>
      {actionData?.codes ? (
        <pre className="mt-6 rounded-md border border-bolt-elements-borderColor p-3 text-xs">
          {actionData.codes.join('\n')}
        </pre>
      ) : null}
    </EnterpriseFormPage>
  );
}
