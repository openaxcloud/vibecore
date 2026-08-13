import * as RadixDialog from '@radix-ui/react-dialog';
import { Building2, Plus } from 'lucide-react';
import { useState } from 'react';
import type { MetaFunction } from 'react-router';
import { Form, useActionData, useLoaderData, useNavigation, useSearchParams } from 'react-router';
import { ActivityList, AppShell } from '~/components/dashboard/SaaSLayout';
import { Dialog, DialogTitle } from '~/components/ui/Dialog';
import {
  apiRequest,
  json,
  redirect,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import { buildOrganizationRows, type Organization } from '~/lib/organizations';
import { shouldRethrowActionError } from '~/lib/route-reauth';

export const meta: MetaFunction = () => [{ title: 'Organizations - E-Code' }];

export async function loader({ request }: EnterpriseLoaderArgs) {
  const result = await apiRequest<{ organizations: Organization[] }>(request, '/orgs');
  return { organizations: result.organizations };
}

type ActionResult = { ok: false; error: string };

export async function action({ request }: EnterpriseActionArgs) {
  const form = await request.formData();
  const name = String(form.get('name') ?? '').trim();

  if (!name) {
    return json<ActionResult>({ ok: false, error: 'Give the organization a name.' }, { status: 400 });
  }

  try {
    const created = await apiRequest<{ organization: Organization }>(request, '/orgs', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });

    /*
     * There is no active-org session state to flip (see ~/lib/organizations):
     * "switching" means navigating into an org-scoped page. Land the user in
     * the new organization's members page so they can invite teammates.
     */
    return redirect(`/organization-members?orgId=${encodeURIComponent(created.organization.id)}`);
  } catch (error) {
    /*
     * Re-throw session-expiry/MFA redirects and 5xx Responses so the framework
     * handles them (see api-keys.tsx for the full rationale).
     */
    if (shouldRethrowActionError(error)) {
      throw error;
    }

    // apiRequest throws a json() Response on 4xx API errors (e.g. the 409 for a taken slug); surface its message inline.
    if (error instanceof Response) {
      const payload = (await error.json().catch(() => null)) as { error?: string } | null;

      return json<ActionResult>({ ok: false, error: payload?.error ?? 'Request failed.' }, { status: error.status });
    }

    return json<ActionResult>({ ok: false, error: 'Request failed.' }, { status: 500 });
  }
}

const BLUE_CTA =
  'inline-flex h-9 items-center justify-center rounded-md bg-[var(--vc-ide-accent-action)] px-4 text-sm font-medium text-white transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)] disabled:cursor-not-allowed disabled:opacity-60';

export default function OrganizationSwitcherPage() {
  const { organizations } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as ActionResult | undefined;
  const navigation = useNavigation();
  const busy = navigation.state !== 'idle';

  // `?create=1` (e.g. the /teams/new redirect) opens the create-org modal on load.
  const [searchParams] = useSearchParams();
  const [createOpen, setCreateOpen] = useState(() => searchParams.get('create') === '1');

  const error = actionData && !actionData.ok ? actionData.error : null;

  return (
    <AppShell
      title="Organizations"
      description="The organizations you belong to, each with isolated projects, billing and RBAC settings."
      actions={
        <button type="button" onClick={() => setCreateOpen(true)} className={BLUE_CTA}>
          New organization
        </button>
      }
    >
      <ActivityList
        items={buildOrganizationRows(organizations).map((row) => ({
          ...row,
          icon: organizations.length ? Building2 : Plus,
        }))}
      />

      <RadixDialog.Root open={createOpen} onOpenChange={setCreateOpen}>
        {createOpen ? (
          <Dialog onClose={() => setCreateOpen(false)} onBackdrop={() => setCreateOpen(false)}>
            <div className="p-6">
              <DialogTitle asChild>
                <h2 className="text-base font-semibold text-bolt-elements-textPrimary">Create an organization</h2>
              </DialogTitle>
              <p className="mt-1 text-sm text-bolt-elements-textSecondary">
                A new organization with isolated projects, members, billing and RBAC. You become its owner.
              </p>

              <Form method="post" className="mt-4 space-y-5">
                <div>
                  <label htmlFor="org-name" className="block text-sm font-medium text-bolt-elements-textPrimary">
                    Name
                  </label>
                  {/* text-base (16px) on mobile prevents iOS Safari's focus auto-zoom, which
                      shifts the viewport-fixed modal off-screen to the right; sm:text-sm keeps
                      the 14px desktop scale. */}
                  <input
                    id="org-name"
                    name="name"
                    type="text"
                    required
                    maxLength={120}
                    placeholder="Acme Inc"
                    className="mt-1 w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-base text-bolt-elements-textPrimary focus:border-bolt-elements-focus focus:outline-none sm:text-sm"
                  />
                </div>

                {error ? (
                  <p
                    role="alert"
                    className="rounded-md border border-[var(--status-error-border)] bg-[var(--status-error-bg)] px-3 py-2 text-sm"
                    style={{ color: 'var(--status-error-text)' }}
                  >
                    {error}
                  </p>
                ) : null}

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setCreateOpen(false)}
                    className="inline-flex h-9 items-center justify-center rounded-md border border-bolt-elements-borderColor px-4 text-sm font-medium text-bolt-elements-textPrimary transition-colors hover:bg-bolt-elements-background-depth-3"
                  >
                    Cancel
                  </button>
                  <button type="submit" disabled={busy} aria-busy={busy} className={BLUE_CTA}>
                    {busy ? 'Creating…' : 'Create organization'}
                  </button>
                </div>
              </Form>
            </div>
          </Dialog>
        ) : null}
      </RadixDialog.Root>
    </AppShell>
  );
}
