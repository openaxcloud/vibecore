import { useState } from 'react';
import { Form, useSubmit } from 'react-router';
import { ConfirmationDialog } from '~/components/ui/Dialog';
import { RelativeTime } from '~/components/ui/RelativeTime';
import { userFacingLabel } from '~/lib/user-facing-labels';

export type PendingInvitation = {
  id: string;
  email: string;
  roleKey: string;
  expiresAt: string;
  acceptedAt?: string;
  createdAt: string;
};

/*
 * Pending-invitation management for the team page: age via RelativeTime, an
 * "Expired" badge once expiresAt passes, Resend (server throttles to 1/min per
 * invite → 429 surfaced by the route action) and Revoke (expires the link).
 *
 * Accent policy: blue = app action (Resend), --status-error-text = destructive
 * (Revoke / Expired). No hard-coded colors.
 */
export function PendingInvitationsSection({ orgId, invitations }: { orgId: string; invitations: PendingInvitation[] }) {
  const submit = useSubmit();

  // Invite the revoke confirmation dialog is open for, or null.
  const [invitePendingRevoke, setInvitePendingRevoke] = useState<{ id: string; email: string } | null>(null);

  // Accepted invites are members already; this section manages open ones only.
  const pending = invitations.filter((invite) => !invite.acceptedAt);
  const now = Date.now();

  return (
    <section className="overflow-hidden rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 text-sm shadow-sm">
      <div className="border-b border-bolt-elements-borderColor px-4 py-3 sm:px-6">
        <h2 className="font-semibold text-bolt-elements-textPrimary">Pending invitations</h2>
        <p className="mt-1 text-xs text-bolt-elements-textSecondary">
          Resend sends a fresh invitation link (once per minute per invite); revoke stops the link working immediately.
        </p>
      </div>
      {pending.length === 0 ? (
        <div className="px-4 py-4 text-bolt-elements-textSecondary sm:px-6">No pending invitations.</div>
      ) : (
        pending.map((invite) => {
          const expired = new Date(invite.expiresAt).getTime() < now;

          return (
            <div
              key={invite.id}
              className="grid gap-3 border-b border-bolt-elements-borderColor px-4 py-4 last:border-b-0 sm:px-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
            >
              <div className="min-w-0">
                <div className="truncate font-medium text-bolt-elements-textPrimary">{invite.email}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-bolt-elements-textSecondary">
                  <span className="rounded-full border border-bolt-elements-borderColor px-2 py-0.5">
                    {userFacingLabel(invite.roleKey, 'Member')}
                  </span>
                  <RelativeTime value={invite.createdAt} prefix="Invited" />
                  {expired ? (
                    <span
                      className="rounded-full border px-2 py-0.5 font-medium"
                      style={{ color: 'var(--status-error-text)', borderColor: 'var(--status-error-text)' }}
                    >
                      Expired
                    </span>
                  ) : (
                    <RelativeTime
                      value={invite.expiresAt}
                      prefix="Expires"
                      className="text-bolt-elements-textTertiary"
                    />
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Form method="post">
                  <input type="hidden" name="intent" value="invite-resend" />
                  <input type="hidden" name="orgId" value={orgId} />
                  <input type="hidden" name="inviteId" value={invite.id} />
                  <button
                    type="submit"
                    className="rounded-md border border-bolt-elements-borderColor px-3 py-1.5 text-xs hover:bg-bolt-elements-background-depth-1"
                    style={{ color: 'var(--vc-ide-accent-action)' }}
                    aria-label={`Resend invitation to ${invite.email}`}
                  >
                    Resend
                  </button>
                </Form>
                <Form
                  method="post"
                  onSubmit={(event) => {
                    // Destructive: confirm before revoking the invite link.
                    event.preventDefault();
                    setInvitePendingRevoke({ id: invite.id, email: invite.email });
                  }}
                >
                  <input type="hidden" name="intent" value="invite-revoke" />
                  <input type="hidden" name="orgId" value={orgId} />
                  <input type="hidden" name="inviteId" value={invite.id} />
                  <button
                    type="submit"
                    className="rounded-md border border-bolt-elements-borderColor px-3 py-1.5 text-xs hover:bg-bolt-elements-background-depth-1"
                    style={{ color: 'var(--status-error-text)' }}
                    aria-label={`Revoke invitation to ${invite.email}`}
                  >
                    Revoke
                  </button>
                </Form>
              </div>
            </div>
          );
        })
      )}
      <ConfirmationDialog
        isOpen={invitePendingRevoke !== null}
        onClose={() => setInvitePendingRevoke(null)}
        onConfirm={() => {
          const pendingRevoke = invitePendingRevoke;
          setInvitePendingRevoke(null);

          if (pendingRevoke) {
            submit({ intent: 'invite-revoke', orgId, inviteId: pendingRevoke.id }, { method: 'post' });
          }
        }}
        title={`Revoke the invitation for ${invitePendingRevoke?.email ?? ''}?`}
        description="The invite link stops working immediately."
        confirmLabel="Revoke invitation"
        variant="destructive"
      />
    </section>
  );
}
