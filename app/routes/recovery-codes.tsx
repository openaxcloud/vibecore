import { Form, useActionData } from 'react-router';
import { EnterpriseFormPage, PrimaryButton } from '~/components/enterprise/EnterpriseFormPage';
import {
  apiErrorMessage,
  apiRequest,
  isApiResponse,
  json,
  type EnterpriseActionArgs,
} from '~/lib/enterprise-api.server';
import { isReauthRedirect } from '~/lib/route-reauth';

export async function action({ request }: EnterpriseActionArgs) {
  try {
    const result = await apiRequest<{ codes: string[] }>(request, '/auth/recovery-codes', { method: 'POST' });
    return json({ status: 'Recovery codes rotated.', codes: result.codes });
  } catch (error) {
    /*
     * A login / MFA re-auth redirect (3xx) must be re-thrown so the browser
     * actually navigates, rather than being swallowed into an inline error.
     */
    if (isReauthRedirect(error)) {
      throw error;
    }

    if (isApiResponse(error)) {
      return json(
        { error: await apiErrorMessage(error, 'Failed to rotate recovery codes.') },
        { status: error.status },
      );
    }

    return json({ error: 'Recovery codes are temporarily unavailable. Please try again in a moment.' });
  }
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
