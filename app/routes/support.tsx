import type { MetaFunction } from '@remix-run/cloudflare';
import { Form, useActionData, useLoaderData } from '@remix-run/react';
import { LifeBuoy, MessageSquare, ShieldAlert } from 'lucide-react';
import { ActivityList, AppShell } from '~/components/dashboard/SaaSLayout';
import { Button } from '~/components/ui/Button';
import {
  apiRequest,
  apiErrorMessage,
  firstOrganization,
  isForbiddenApiResponse,
  json,
  redirect,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';

type Ticket = { id: string; subject: string; status: string; createdAt?: string };

export const meta: MetaFunction = () => [{ title: 'Support - VibeCore' }];

export async function loader({ request }: EnterpriseLoaderArgs) {
  try {
    const organization = await firstOrganization(request);
    const tickets = await apiRequest<{ tickets: Ticket[] }>(request, `/support/${organization.id}/tickets`);

    return { organization, tickets: tickets.tickets, supportAccessLimited: null };
  } catch (error) {
    return {
      organization: null,
      tickets: [],
      supportAccessLimited: await apiErrorMessage(
        error,
        'Support tickets are temporarily unavailable. The support page is still available.',
      ),
    };
  }
}

export async function action({ request }: EnterpriseActionArgs) {
  const organization = await firstOrganization(request);
  const form = await request.formData();

  try {
    await apiRequest(request, `/orgs/${organization.id}/support/tickets`, {
      method: 'POST',
      body: JSON.stringify({ subject: String(form.get('subject') ?? '') }),
    });
  } catch (error) {
    if (isForbiddenApiResponse(error)) {
      return json(
        { error: await apiErrorMessage(error, 'You cannot create support tickets for this organization.') },
        { status: 403 },
      );
    }

    throw error;
  }

  return redirect('/support');
}

export default function SupportPage() {
  const { tickets, supportAccessLimited } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as { error?: string } | undefined;
  const visibleTickets = tickets.filter(Boolean) as Ticket[];

  return (
    <AppShell title="Support" description="Open support tickets and review enterprise support status.">
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        {actionData?.error ? (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-400 lg:col-span-2">
            {actionData.error}
          </div>
        ) : null}
        {supportAccessLimited ? (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200 lg:col-span-2">
            {supportAccessLimited}
          </div>
        ) : null}
        <ActivityList
          items={
            visibleTickets.length
              ? visibleTickets.map((ticket) => ({
                  title: ticket.subject,
                  detail: `${ticket.status} - ${ticket.createdAt ? new Date(ticket.createdAt).toLocaleString() : 'recorded'}`,
                  icon: LifeBuoy,
                }))
              : [
                  {
                    title: 'No support tickets',
                    detail: 'Open a ticket for runtime, billing or security support.',
                    icon: MessageSquare,
                  },
                ]
          }
        />
        <Form
          method="post"
          className="grid gap-4 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-6"
        >
          <label className="grid gap-2 text-sm font-medium">
            Subject
            <input
              className="h-10 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 text-sm outline-none"
              name="subject"
              required
            />
          </label>
          <p className="text-sm text-bolt-elements-textSecondary">
            <ShieldAlert className="mr-2 inline h-4 w-4" aria-hidden />
            Ticket creation is stored in the backend and audited.
          </p>
          <Button type="submit">Open ticket</Button>
        </Form>
      </div>
    </AppShell>
  );
}
