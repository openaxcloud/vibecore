import { ArrowLeft, LifeBuoy } from 'lucide-react';
import type { MetaFunction } from 'react-router';
import { Form, Link, useActionData, useLoaderData } from 'react-router';
import { AppShell } from '~/components/dashboard/SaaSLayout';
import { Badge } from '~/components/ui/Badge';
import { Button } from '~/components/ui/Button';
import { RelativeTime } from '~/components/ui/RelativeTime';
import {
  apiErrorMessage,
  apiRequest,
  firstOrganization,
  json,
  redirect,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import { isReauthRedirect } from '~/lib/route-reauth';
import { statusDisplayLabel } from '~/lib/user-facing-labels';

type Ticket = { id: string; subject: string; status: string; category?: string; createdAt?: string };
type TicketMessage = {
  id: string;
  authorType: 'USER' | 'ADMIN' | 'SYSTEM';
  body: string;
  createdAt: string;
};

export const meta: MetaFunction = () => [{ title: 'Support ticket · E-Code' }];

// Mirror of SupportTicketStatus badge variants used on the list page.
const STATUS_BADGE_VARIANT: Record<string, 'success' | 'warning' | 'secondary'> = {
  OPEN: 'warning',
  PENDING: 'warning',
  RESOLVED: 'success',
  CLOSED: 'secondary',
};

const AUTHOR_LABEL: Record<TicketMessage['authorType'], string> = {
  USER: 'You',
  ADMIN: 'Support',
  SYSTEM: 'System',
};

export async function loader({ request, params }: EnterpriseLoaderArgs) {
  const ticketId = params.id!;

  try {
    const organization = await firstOrganization(request);

    const detail = await apiRequest<{ ticket?: Ticket; messages?: TicketMessage[] }>(
      request,
      `/support/${organization.id}/tickets/${ticketId}`,
    );

    return {
      ticket: detail?.ticket ?? null,
      messages: Array.isArray(detail?.messages) ? detail.messages : [],
      error: null as string | null,
    };
  } catch (error) {
    // Re-throw the login / MFA re-auth redirect so the framework handles it.
    if (isReauthRedirect(error)) {
      throw error;
    }

    return {
      ticket: null,
      messages: [] as TicketMessage[],
      error: await apiErrorMessage(error, 'This ticket is unavailable. It may have been closed or moved.'),
    };
  }
}

export async function action({ request, params }: EnterpriseActionArgs) {
  const ticketId = params.id!;

  try {
    const organization = await firstOrganization(request);
    const form = await request.formData();
    const body = String(form.get('body') ?? '').trim();

    if (!body) {
      return json({ error: 'Write a message before sending.' });
    }

    await apiRequest(request, `/orgs/${organization.id}/support/tickets/${ticketId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    });

    // PRG: reload the thread with the new message.
    return redirect(`/support/${ticketId}`);
  } catch (error) {
    if (isReauthRedirect(error)) {
      throw error;
    }

    return json({ error: await apiErrorMessage(error, 'We could not send your message. Please try again.') });
  }
}

function MessageBubble({ message }: { message: TicketMessage }) {
  const mine = message.authorType === 'USER';

  return (
    <li className={`flex flex-col gap-1 ${mine ? 'items-end' : 'items-start'}`}>
      <div
        className={`max-w-[85%] rounded-lg border border-bolt-elements-borderColor p-3 text-sm ${
          mine ? 'bg-bolt-elements-background-depth-3' : 'bg-bolt-elements-background-depth-2'
        }`}
      >
        <p className="mb-1 text-xs font-medium text-bolt-elements-textSecondary">{AUTHOR_LABEL[message.authorType]}</p>
        <p className="whitespace-pre-wrap break-words">{message.body}</p>
      </div>
      <span className="text-xs text-bolt-elements-textTertiary">
        <RelativeTime value={message.createdAt} />
      </span>
    </li>
  );
}

export default function SupportTicketPage() {
  const { ticket, messages, error } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as { error?: string } | undefined;
  const closed = ticket?.status === 'CLOSED';

  return (
    <AppShell title="Support ticket" description="Review the conversation and reply to your support request.">
      <Link
        to="/support"
        className="mb-4 inline-flex items-center gap-1 text-sm text-bolt-elements-textSecondary hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back to support
      </Link>

      {error || !ticket ? (
        <div className="rounded-lg border border-[var(--status-error-border)] bg-[var(--status-error-bg)] p-4 text-sm text-[var(--status-error-text)]">
          {error ?? 'Ticket not found.'}
        </div>
      ) : (
        <div className="mx-auto max-w-2xl">
          <div className="mb-4 flex items-start gap-3 rounded-lg border border-bolt-elements-borderColor p-4">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-bolt-elements-background-depth-3">
              <LifeBuoy className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{ticket.subject}</p>
              <p className="mt-1 text-sm text-bolt-elements-textSecondary">
                {ticket.createdAt ? <RelativeTime value={ticket.createdAt} prefix="opened" /> : 'recorded'}
              </p>
            </div>
            <Badge variant={STATUS_BADGE_VARIANT[ticket.status] ?? 'secondary'} size="md">
              {statusDisplayLabel(ticket.status)}
            </Badge>
          </div>

          {messages.length ? (
            <ul className="mb-4 flex flex-col gap-4">
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
            </ul>
          ) : (
            <p className="mb-4 text-sm text-bolt-elements-textSecondary">
              No replies yet. Add a message below and our support team will follow up.
            </p>
          )}

          {actionData?.error ? (
            <div className="mb-3 rounded-lg border border-[var(--status-error-border)] bg-[var(--status-error-bg)] p-3 text-sm text-[var(--status-error-text)]">
              {actionData.error}
            </div>
          ) : null}

          {closed ? (
            <p className="rounded-lg border border-bolt-elements-borderColor p-3 text-sm text-bolt-elements-textSecondary">
              This ticket is closed. Open a new ticket if you still need help.
            </p>
          ) : (
            <Form method="post" className="flex flex-col gap-2">
              <label htmlFor="ticket-reply" className="sr-only">
                Your message
              </label>
              <textarea
                id="ticket-reply"
                name="body"
                rows={4}
                required
                maxLength={10000}
                placeholder="Add a reply…"
                className="w-full resize-y rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-bolt-elements-borderColorActive"
              />
              <div className="flex justify-end">
                <Button type="submit">Send message</Button>
              </div>
            </Form>
          )}
        </div>
      )}
    </AppShell>
  );
}
