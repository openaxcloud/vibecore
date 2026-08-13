import { Clock, LifeBuoy, MessageSquare, ShieldAlert } from 'lucide-react';
import type { MetaFunction } from 'react-router';
import { Form, Link, useActionData, useLoaderData, useNavigation, useRevalidator } from 'react-router';
import { AsyncPanelError, AsyncPanelSkeleton } from '~/components/dashboard/AsyncPanelState';
import { AppShell } from '~/components/dashboard/SaaSLayout';
import { Badge } from '~/components/ui/Badge';
import { Button } from '~/components/ui/Button';
import { RelativeTime } from '~/components/ui/RelativeTime';
import {
  apiRequest,
  apiErrorMessage,
  firstOrganization,
  firstOrganizationOrNull,
  isApiResponse,
  isForbiddenApiResponse,
  json,
  redirect,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import { isReauthRedirect } from '~/lib/route-reauth';
import { statusDisplayLabel } from '~/lib/user-facing-labels';

type Ticket = { id: string; subject: string; status: string; category?: string; createdAt?: string };

/**
 * Mirrors SUPPORT_TICKET_CATEGORIES in services/api/src/app.ts (the create
 * route validates against that enum).
 */
const TICKET_CATEGORIES = [
  { value: 'runtime', label: 'Runtime & workspaces' },
  { value: 'billing', label: 'Billing & plans' },
  { value: 'security', label: 'Security' },
  { value: 'account', label: 'Account & access' },
  { value: 'other', label: 'Something else' },
] as const;

/**
 * Target first-response times per plan tier, keyed off the credit plan
 * catalog (packages/billing `creditPlanCatalog`: starter/core/pro/enterprise).
 *
 * ⚠️ These are TARGETS, not contractual SLAs — no support policy document
 * exists in the repo yet, so the figures below are provisional and pending
 * business validation (design handoff E18). Edit this constant once the real
 * policy is decided; the table renders from it alone.
 */
const SUPPORT_RESPONSE_TARGETS = [
  { key: 'starter', name: 'Starter', target: '2 business days' },
  { key: 'core', name: 'Core', target: '1 business day' },
  { key: 'pro', name: 'Pro', target: '8 business hours' },
  { key: 'enterprise', name: 'Enterprise', target: '4 business hours' },
] as const;

/**
 * Fold the billing endpoint's plan key (legacy keys free/pro/team/enterprise
 * or credit keys) onto the tier keys used by SUPPORT_RESPONSE_TARGETS, same
 * folding as packages/billing `toCreditPlanKey` (free→starter, team→pro).
 * Unknown keys highlight nothing rather than guessing.
 */
const PLAN_KEY_TO_TIER: Record<string, string> = {
  free: 'starter',
  starter: 'starter',
  core: 'core',
  pro: 'pro',
  team: 'pro',
  enterprise: 'enterprise',
};

const OPEN_STATUSES = new Set(['OPEN', 'PENDING']);

const STATUS_BADGE_VARIANT: Record<string, 'info' | 'warning' | 'success' | 'secondary'> = {
  OPEN: 'info',
  PENDING: 'warning',
  RESOLVED: 'success',
  CLOSED: 'secondary',
};

function categoryLabel(category: string | undefined) {
  return TICKET_CATEGORIES.find((option) => option.value === category)?.label;
}

export const meta: MetaFunction = () => [{ title: 'Support - E-Code' }];
export { UserAreaRouteErrorBoundary as ErrorBoundary } from '~/components/dashboard/UserAreaRouteError';

export async function loader({ request }: EnterpriseLoaderArgs) {
  try {
    const organization = await firstOrganization(request);

    /*
     * The plan read is best-effort decoration for the response-times table:
     * billing:read is a stricter scope than support:write, so a member who can
     * open tickets may legitimately 403 here — never let that (or any billing
     * hiccup) degrade the support page.
     */
    const [tickets, billing] = await Promise.all([
      apiRequest<{ tickets?: Ticket[] }>(request, `/support/${organization.id}/tickets`),
      apiRequest<{ plan?: { key?: string } }>(request, `/orgs/${organization.id}/billing`).catch(() => null),
    ]);

    const planKey = typeof billing?.plan?.key === 'string' ? billing.plan.key : null;

    /*
     * apiRequest returns the raw JSON of a 200 response with no shape validation,
     * so a payload skew between api versions (or `{}`) leaves `tickets.tickets`
     * undefined. Normalize to an array here so the component's `.filter(Boolean)`
     * never crashes the whole page to the root error boundary.
     */
    return {
      organization,
      tickets: Array.isArray(tickets?.tickets) ? tickets.tickets : [],
      currentTier: planKey ? (PLAN_KEY_TO_TIER[planKey] ?? null) : null,
      supportAccessLimited: null,
    };
  } catch (error) {
    /*
     * A 3xx Response here is the login / MFA re-auth redirect thrown by the
     * enterprise API on an expired or absent session. Re-throw it so the
     * framework performs the redirect instead of degrading it into a generic
     * "support unavailable" banner on the authenticated page.
     */
    if (isReauthRedirect(error)) {
      throw error;
    }

    return {
      organization: null,
      tickets: [],
      currentTier: null,
      supportAccessLimited: await apiErrorMessage(
        error,
        'Support tickets are temporarily unavailable. The support page is still available.',
      ),
    };
  }
}

export async function action({ request }: EnterpriseActionArgs) {
  const organization = await firstOrganizationOrNull(request);

  if (!organization) {
    return json({ error: 'No organization found' }, { status: 400 });
  }

  const form = await request.formData();

  try {
    await apiRequest(request, `/orgs/${organization.id}/support/tickets`, {
      method: 'POST',
      body: JSON.stringify({
        subject: String(form.get('subject') ?? ''),

        // `|| 'other'` (not ??) so an empty select value falls back too.
        category: String(form.get('category') || 'other'),
      }),
    });
  } catch (error) {
    if (isForbiddenApiResponse(error)) {
      return json(
        { error: await apiErrorMessage(error, 'You cannot create support tickets for this organization.') },
        { status: 403 },
      );
    }

    /*
     * A 3xx redirect Response thrown here is the session-expiry login or
     * MFA_REQUIRED re-auth navigation (see enterprise-api.server.ts). It is still
     * `instanceof Response`, so re-throw it BEFORE the isApiResponse branch —
     * otherwise the redirect's Location is discarded.
     */
    if (isReauthRedirect(error)) {
      throw error;
    }

    if (isApiResponse(error)) {
      return json(
        { error: await apiErrorMessage(error, 'We could not open your support ticket. Please try again later.') },
        { status: error.status },
      );
    }

    /*
     * Non-Response failures (a 500/502 from the api, an AbortSignal.timeout, or a
     * hung pod network error) would otherwise re-throw and crash the whole Support
     * page to the root error boundary. Surface the inline banner instead.
     */
    console.error('Failed to create support ticket:', error);

    return json({ error: 'Support is temporarily unavailable. Please try again later.' });
  }

  return redirect('/support');
}

function TicketRow({ ticket }: { ticket: Ticket }) {
  const category = categoryLabel(ticket.category);

  return (
    <li className="flex items-start gap-3 border-t border-bolt-elements-borderColor p-4 first:border-t-0">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-bolt-elements-background-depth-3">
        <LifeBuoy className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <Link
          to={`/support/${ticket.id}`}
          className="inline-flex min-h-[44px] max-w-full items-center truncate text-sm font-medium hover:underline focus:underline focus:outline-none"
        >
          {ticket.subject}
        </Link>
        <p className="mt-1 text-sm text-bolt-elements-textSecondary">
          {category ? `${category} · ` : null}
          {ticket.createdAt ? <RelativeTime value={ticket.createdAt} prefix="opened" /> : 'recorded'}
        </p>
      </div>
      <Badge variant={STATUS_BADGE_VARIANT[ticket.status] ?? 'secondary'} size="md">
        {statusDisplayLabel(ticket.status)}
      </Badge>
    </li>
  );
}

export default function SupportPage() {
  const { tickets, currentTier, supportAccessLimited } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as { error?: string } | undefined;
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const visibleTickets = (tickets ?? []).filter(Boolean) as Ticket[];
  const openTickets = visibleTickets.filter((ticket) => OPEN_STATUSES.has(ticket.status));
  const pastTickets = visibleTickets.filter((ticket) => !OPEN_STATUSES.has(ticket.status));
  const retrying = revalidator.state !== 'idle';
  const openingTicket = navigation.state !== 'idle' && navigation.formMethod?.toLowerCase() === 'post';

  return (
    <AppShell title="Support" description="Open support tickets and review enterprise support status.">
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        {actionData?.error ? (
          <div className="rounded-lg border border-[var(--status-error-border)] bg-[var(--status-error-bg)] p-4 text-sm text-[var(--status-error-text)] lg:col-span-2">
            {actionData.error}
          </div>
        ) : null}
        <div className="grid content-start gap-6">
          <section className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-sm">
            <h2 className="border-b border-bolt-elements-borderColor p-4 text-sm font-semibold">Your open tickets</h2>
            {supportAccessLimited ? (
              retrying ? (
                <AsyncPanelSkeleton label="Loading support tickets" rows={3} compact className="m-4" />
              ) : (
                <AsyncPanelError
                  title="Support tickets could not load"
                  description="Your ticket history is hidden because the latest request failed. No ticket was changed."
                  onRetry={revalidator.revalidate}
                  tone="warning"
                  compact
                  className="m-4"
                />
              )
            ) : openTickets.length ? (
              <ul>
                {openTickets.map((ticket) => (
                  <TicketRow key={ticket.id} ticket={ticket} />
                ))}
              </ul>
            ) : (
              <div className="flex items-start gap-3 p-4">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-bolt-elements-background-depth-3">
                  <MessageSquare className="h-4 w-4" aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-medium">No open tickets</p>
                  <p className="mt-1 text-sm text-bolt-elements-textSecondary">
                    Open a ticket for runtime, billing or security support.
                  </p>
                </div>
              </div>
            )}
          </section>

          {pastTickets.length ? (
            <section className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-sm">
              <h2 className="border-b border-bolt-elements-borderColor p-4 text-sm font-semibold text-bolt-elements-textSecondary">
                Resolved &amp; closed
              </h2>
              <ul>
                {pastTickets.map((ticket) => (
                  <TicketRow key={ticket.id} ticket={ticket} />
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <div className="grid content-start gap-6">
          <Form
            method="post"
            className="grid gap-4 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-6"
          >
            <label className="grid gap-2 text-sm font-medium">
              Subject
              <input
                className="h-[44px] rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 text-sm outline-none"
                name="subject"
                required
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Category
              <select
                className="h-[44px] rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 text-sm outline-none"
                name="category"
                defaultValue="other"
                required
              >
                {TICKET_CATEGORIES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-sm text-bolt-elements-textSecondary">
              <ShieldAlert className="mr-2 inline h-4 w-4" aria-hidden />
              Your request is logged securely and included in your organization&apos;s audit history.
            </p>
            <Button className="min-h-[44px]" type="submit" disabled={openingTicket} aria-busy={openingTicket}>
              {openingTicket ? 'Opening ticket…' : 'Open ticket'}
            </Button>
          </Form>

          <section className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-6">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Clock className="h-4 w-4" aria-hidden />
              Response times
            </h2>
            <p className="mt-1 text-sm text-bolt-elements-textSecondary">
              Target first response by plan. Targets, not contractual guarantees.
            </p>
            <table className="mt-4 w-full text-sm">
              <tbody>
                {SUPPORT_RESPONSE_TARGETS.map((tier) => {
                  const isCurrent = tier.key === currentTier;

                  return (
                    <tr key={tier.key} className="border-t border-bolt-elements-borderColor first:border-t-0">
                      <td className={`py-2 pr-3 ${isCurrent ? 'font-semibold' : ''}`}>
                        {/* div (not span): Badge renders a <div>, invalid inside <span>. */}
                        <div className="flex items-center gap-2">
                          {tier.name}
                          {isCurrent ? (
                            <Badge variant="info" size="sm">
                              Your plan
                            </Badge>
                          ) : null}
                        </div>
                      </td>
                      <td
                        className={`py-2 text-right ${isCurrent ? 'font-semibold' : 'text-bolt-elements-textSecondary'}`}
                      >
                        {tier.target}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
