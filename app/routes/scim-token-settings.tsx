import { KeyRound, RefreshCw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Form, useActionData, useLoaderData, useNavigation, useSubmit } from 'react-router';
import { EnterpriseFormPage, PrimaryButton, TextField } from '~/components/enterprise/EnterpriseFormPage';
import { ConfirmationDialog } from '~/components/ui/Dialog';
import {
  apiErrorMessage,
  apiRequest,
  firstOrganizationOrNull,
  formObject,
  isApiResponse,
  json,
  redirect,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import { formatUserAreaDate } from '~/lib/i18n/user-area-locale';
import { isReauthRedirect } from '~/lib/route-reauth';
import { classNames } from '~/utils/classNames';

/*
 * Shape returned by `GET /orgs/:orgId/scim/tokens` (services/api/src/app.ts:14732).
 * The token secret itself is NEVER listed — only its metadata. `expiresAt` is
 * derived server-side from createdAt + SCIM_TOKEN_MAX_AGE_DAYS (default 365),
 * so the create/rotate forms take no expiry input (backend default applies).
 */
type ScimToken = {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string;
  expired: boolean;
};

export async function loader({ request }: EnterpriseLoaderArgs) {
  const organization = await firstOrganizationOrNull(request);

  if (!organization) {
    return redirect('/');
  }

  let scimTokens: ScimToken[] = [];

  try {
    const result = await apiRequest<{ scimTokens: ScimToken[] }>(request, `/orgs/${organization.id}/scim/tokens`);
    scimTokens = result.scimTokens ?? [];
  } catch (error) {
    // A login / MFA re-auth redirect must bubble so the framework performs it.
    if (isReauthRedirect(error)) {
      throw error;
    }

    /*
     * A 403 (missing scim:manage) or any other non-redirect failure should not
     * blank-page the settings screen. Render the create form with an empty list;
     * the caller still gets a friendly page and any real error surfaces on submit.
     */
    scimTokens = [];
  }

  return json({ orgId: organization.id, scimTokens });
}

type ActionData =
  | { status: string; token?: string; error?: undefined }
  | { error: string; status?: undefined; token?: undefined };

export async function action({ request }: EnterpriseActionArgs) {
  const body = formObject(await request.formData()) as {
    orgId?: string;
    name?: string;
    intent?: string;
    tokenId?: string;
  };

  if (!body.orgId) {
    return json({ error: 'Your organization is unavailable. Reload the page and try again.' } satisfies ActionData, {
      status: 400,
    });
  }

  try {
    if (body.intent === 'revoke') {
      if (!body.tokenId) {
        return json({ error: 'Token ID is required.' } satisfies ActionData, { status: 400 });
      }

      await apiRequest(request, `/orgs/${body.orgId}/scim/tokens/${encodeURIComponent(body.tokenId)}`, {
        method: 'DELETE',
      });

      return json({ status: 'SCIM token revoked.' } satisfies ActionData);
    }

    if (body.intent === 'rotate') {
      if (!body.tokenId) {
        return json({ error: 'Token ID is required.' } satisfies ActionData, { status: 400 });
      }

      const rotated = await apiRequest<{ token: string }>(
        request,
        `/orgs/${body.orgId}/scim/tokens/${encodeURIComponent(body.tokenId)}/rotate`,
        { method: 'POST' },
      );

      return json({
        status: 'SCIM token rotated. Copy the new value now; it is shown once.',
        token: rotated.token,
      } satisfies ActionData);
    }

    // Default intent: create.
    const result = await apiRequest<{ token: string }>(request, `/orgs/${body.orgId}/scim/tokens`, {
      method: 'POST',
      body: JSON.stringify({ name: body.name }),
    });

    return json({
      status: 'SCIM token created. Copy it now; it is shown once.',
      token: result.token,
    } satisfies ActionData);
  } catch (error) {
    if (isReauthRedirect(error)) {
      throw error;
    }

    if (isApiResponse(error)) {
      return json({ error: await apiErrorMessage(error, 'Failed to create SCIM token.') } satisfies ActionData, {
        status: error.status,
      });
    }

    return json({
      error: 'Managing SCIM tokens is temporarily unavailable. Please try again in a moment.',
    } satisfies ActionData);
  }
}

const dateFormat: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' };

function formatDate(value: string | null) {
  return value ? formatUserAreaDate(value, dateFormat) : null;
}

export default function ScimTokenSettingsPage() {
  const { orgId, scimTokens } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as ActionData | undefined;
  const navigation = useNavigation();
  const submit = useSubmit();
  const busy = navigation.state !== 'idle';
  const [tokenPendingRevoke, setTokenPendingRevoke] = useState<{ id: string; name: string } | null>(null);

  return (
    <EnterpriseFormPage
      title="SCIM token settings"
      description="Create bearer tokens for your identity provider to provision and de-provision members over SCIM. Tokens are hashed at rest and shown in full only once, at creation or rotation."
      status={actionData?.status}
      error={actionData?.error}
    >
      {actionData?.token ? (
        <div
          role="status"
          aria-live="polite"
          className="mb-6 rounded-lg border border-[var(--status-success-border)] bg-[var(--status-success-bg)] p-4"
        >
          <p className="text-sm font-semibold text-bolt-elements-textPrimary">Copy this token now</p>
          <p className="mt-1 text-sm text-bolt-elements-textSecondary">
            This is the only time the token is shown. Paste it into your identity provider&apos;s SCIM configuration;
            you won&apos;t be able to see it again.
          </p>
          <code className="mt-3 block overflow-x-auto rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-3 px-3 py-2 font-mono text-sm text-bolt-elements-textPrimary">
            {actionData.token}
          </code>
        </div>
      ) : null}

      <section>
        <h2 className="text-base font-semibold text-bolt-elements-textPrimary">Create a token</h2>
        <p className="mt-1 text-sm text-bolt-elements-textSecondary">
          Tokens expire automatically per your organization&apos;s SCIM token lifetime.
        </p>
        <Form method="post" className="mt-4 space-y-4">
          <input type="hidden" name="orgId" value={orgId} />
          <TextField label="Token name" name="name" placeholder="Okta provisioning" required />
          <PrimaryButton disabled={busy} aria-busy={busy}>
            {busy ? 'Working…' : 'Create SCIM token'}
          </PrimaryButton>
        </Form>
      </section>

      <hr className="my-8 border-bolt-elements-borderColor" />

      <section>
        <h2 className="text-base font-semibold text-bolt-elements-textPrimary">
          Active tokens
          <span className="ml-2 rounded-full border border-bolt-elements-borderColor px-2 py-0.5 text-xs font-normal text-bolt-elements-textSecondary">
            {scimTokens.length}
          </span>
        </h2>

        {scimTokens.length === 0 ? (
          <div className="mt-4 flex flex-col items-center gap-3 rounded-lg border border-bolt-elements-borderColor px-6 py-10 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-bolt-elements-background-depth-3">
              <KeyRound className="h-5 w-5 text-bolt-elements-textTertiary" aria-hidden />
            </span>
            <p className="text-sm text-bolt-elements-textSecondary">No SCIM tokens yet. Create one above.</p>
          </div>
        ) : (
          <ul className="mt-4 rounded-lg border border-bolt-elements-borderColor">
            {scimTokens.map((token, index) => {
              const created = formatDate(token.createdAt);
              const lastUsed = formatDate(token.lastUsedAt);
              const expires = formatDate(token.expiresAt);

              return (
                <li
                  key={token.id}
                  className={classNames(
                    'flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between',
                    index > 0 && 'border-t border-bolt-elements-borderColor',
                  )}
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 break-words text-sm font-medium text-bolt-elements-textPrimary">
                      <span title={token.name}>{token.name}</span>
                      {token.expired ? (
                        <span className="rounded-full border border-[var(--status-error-border)] px-2 py-0.5 text-xs font-normal text-[var(--status-error-text)]">
                          Expired
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-2 text-xs text-bolt-elements-textTertiary">
                      {created ? `Created ${created}` : null}
                      {lastUsed ? ` · Last used ${lastUsed}` : ' · Never used'}
                      {expires ? ` · Expires ${expires}` : null}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Form method="post">
                      <input type="hidden" name="orgId" value={orgId} />
                      <input type="hidden" name="intent" value="rotate" />
                      <input type="hidden" name="tokenId" value={token.id} />
                      <button
                        type="submit"
                        disabled={busy}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-bolt-elements-borderColor px-3 text-xs font-medium text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3 disabled:opacity-60"
                      >
                        <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                        Rotate
                      </button>
                    </Form>
                    <Form
                      method="post"
                      onSubmit={(event) => {
                        event.preventDefault();
                        setTokenPendingRevoke({ id: token.id, name: token.name });
                      }}
                    >
                      <input type="hidden" name="orgId" value={orgId} />
                      <input type="hidden" name="intent" value="revoke" />
                      <input type="hidden" name="tokenId" value={token.id} />
                      <button
                        type="submit"
                        disabled={busy}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-bolt-elements-borderColor px-3 text-xs font-medium text-[var(--status-error-text)] hover:bg-[var(--status-error-bg)] disabled:opacity-60"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        Revoke
                      </button>
                    </Form>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <ConfirmationDialog
        isOpen={tokenPendingRevoke !== null}
        onClose={() => setTokenPendingRevoke(null)}
        onConfirm={() => {
          const pending = tokenPendingRevoke;
          setTokenPendingRevoke(null);

          if (pending) {
            submit({ orgId: orgId ?? '', intent: 'revoke', tokenId: pending.id }, { method: 'post' });
          }
        }}
        title={`Revoke SCIM token "${tokenPendingRevoke?.name ?? ''}"?`}
        description="Your identity provider will immediately lose provisioning access. This cannot be undone."
        confirmLabel="Revoke token"
        variant="destructive"
      />
    </EnterpriseFormPage>
  );
}
