import { useState } from 'react';
import { Form, useActionData, useLoaderData, useSubmit } from 'react-router';
import { EnterpriseFormPage, PrimaryButton } from '~/components/enterprise/EnterpriseFormPage';
import { ConfirmationDialog } from '~/components/ui/Dialog';
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
  const submit = useSubmit();
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);

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
      {/* Compact status pill (was an oversized block). */}
      {typeof remaining === 'number' ? (
        <div
          className={`mb-4 inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border px-3 py-1.5 ${
            isZero
              ? 'border-bolt-elements-icon-error/40 bg-bolt-elements-icon-error/10'
              : 'border-bolt-elements-borderColor bg-bolt-elements-background-depth-1'
          }`}
        >
          <span className="text-base font-semibold text-bolt-elements-textPrimary">
            {remaining}
            {typeof total === 'number' ? (
              <span className="text-sm font-normal text-bolt-elements-textSecondary"> / {total}</span>
            ) : null}
          </span>
          <span className="text-sm text-bolt-elements-textSecondary">
            {remaining === 1 ? 'recovery code remaining' : 'recovery codes remaining'}
          </span>
          {isZero ? (
            <span className="text-xs font-medium text-bolt-elements-icon-error">· none left — generate a set</span>
          ) : isLow ? (
            <span className="text-xs font-medium text-bolt-elements-textPrimary">· running low</span>
          ) : null}
        </div>
      ) : null}

      {/* Explain what recovery codes are, the current state, and how to use them. */}
      <div className="mb-6 space-y-2 text-sm leading-6 text-bolt-elements-textSecondary">
        <p>
          <span className="font-medium text-bolt-elements-textPrimary">Recovery codes</span> are one-time backup codes
          that let you sign in if you ever lose access to your authenticator app — your MFA fallback.
        </p>
        <p>
          You currently have{' '}
          <span className="font-medium text-bolt-elements-textPrimary">
            {remaining ?? 0} of {total ?? 10}
          </span>{' '}
          unused codes{isZero ? ' — none have been generated yet' : ''}.{' '}
          <span className="font-medium text-bolt-elements-textPrimary">Generate recovery codes</span> creates a fresh
          set of 10 and permanently invalidates any previous set.
        </p>
        <p>
          Each code works <span className="font-medium text-bolt-elements-textPrimary">once</span>. They are shown only
          at generation, so copy them and store them somewhere safe — a password manager, or printed and locked away.
        </p>
      </div>

      <Form
        method="post"
        onSubmit={(event) => {
          event.preventDefault();
          setConfirmRegenerate(true);
        }}
      >
        <PrimaryButton>Generate recovery codes</PrimaryButton>
      </Form>
      <ConfirmationDialog
        isOpen={confirmRegenerate}
        onClose={() => setConfirmRegenerate(false)}
        onConfirm={() => {
          setConfirmRegenerate(false);
          submit({}, { method: 'post' });
        }}
        title="Generate new recovery codes?"
        description="Generating new recovery codes permanently invalidates all of your existing codes."
        confirmLabel="Generate codes"
        variant="destructive"
      />
      {actionData?.codes ? (
        <pre className="mt-6 rounded-md border border-bolt-elements-borderColor p-3 text-xs text-bolt-elements-textPrimary">
          {actionData.codes.join('\n')}
        </pre>
      ) : null}
    </EnterpriseFormPage>
  );
}
