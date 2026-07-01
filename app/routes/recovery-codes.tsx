import { Form, useActionData, useLoaderData } from 'react-router';
import { EnterpriseFormPage, PrimaryButton } from '~/components/enterprise/EnterpriseFormPage';
import {
  apiErrorMessage,
  apiRequest,
  isApiResponse,
  json,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import { isReauthRedirect } from '~/lib/route-reauth';

type RecoveryCodesStatus = { remaining: number; total?: number };

export async function loader({ request }: EnterpriseLoaderArgs) {
  try {
    const status = await apiRequest<RecoveryCodesStatus>(request, '/auth/recovery-codes/status');

    return json({ status });
  } catch (error) {
    /* A login / MFA re-auth redirect must navigate, not be swallowed into the page. */
    if (isReauthRedirect(error)) {
      throw error;
    }

    // Non-fatal: the page still functions for generating codes even if the count is unavailable.
    return json({ status: null as RecoveryCodesStatus | null });
  }
}

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

/** Below this many unused codes we nudge the user to regenerate. */
const LOW_REMAINING_THRESHOLD = 3;

export default function RecoveryCodesPage() {
  const loaderData = useLoaderData<typeof loader>() as { status: RecoveryCodesStatus | null };

  const actionData = useActionData<typeof action>() as
    | { status?: string; error?: string; codes?: string[] }
    | undefined;

  const status = loaderData.status;

  // After a rotation the loader count is stale; the fresh set is the full complement.
  const remaining = actionData?.codes ? actionData.codes.length : status?.remaining;
  const total = actionData?.codes ? actionData.codes.length : status?.total;

  const isZero = remaining === 0;
  const isLow = typeof remaining === 'number' && remaining > 0 && remaining <= LOW_REMAINING_THRESHOLD;

  return (
    <EnterpriseFormPage
      title="Recovery codes"
      description="Rotate one-time account recovery codes for MFA fallback."
      status={actionData?.status}
      error={actionData?.error}
    >
      {typeof remaining === 'number' ? (
        <div
          className={`mb-6 rounded-md border p-4 ${
            isZero
              ? 'border-bolt-elements-icon-error/40 bg-bolt-elements-icon-error/10'
              : 'border-bolt-elements-borderColor bg-bolt-elements-background-depth-2'
          }`}
        >
          <p className="text-2xl font-semibold text-bolt-elements-textPrimary">
            {remaining}
            {typeof total === 'number' ? (
              <span className="text-base font-normal text-bolt-elements-textSecondary"> / {total}</span>
            ) : null}
          </p>
          <p className="mt-1 text-sm text-bolt-elements-textSecondary">
            {remaining === 1 ? 'recovery code remaining' : 'recovery codes remaining'}
          </p>
          {isZero ? (
            <p className="mt-3 text-sm text-bolt-elements-icon-error">
              You have no usable recovery codes left. Generate a new set now so you don&apos;t get locked out if you
              lose your authenticator.
            </p>
          ) : isLow ? (
            <p className="mt-3 text-sm font-medium text-bolt-elements-textPrimary">
              You&apos;re running low on recovery codes. Consider generating a fresh set.
            </p>
          ) : null}
        </div>
      ) : null}

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
        <pre className="mt-6 rounded-md border border-bolt-elements-borderColor p-3 text-xs text-bolt-elements-textPrimary">
          {actionData.codes.join('\n')}
        </pre>
      ) : null}
    </EnterpriseFormPage>
  );
}
